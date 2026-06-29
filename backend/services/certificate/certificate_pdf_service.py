# backend/services/certificate_pdf_service.py
"""Generate certificate PDF using Playwright (Highly Optimized Threaded Version)."""

import sys
import logging
import traceback
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

from sqlalchemy.orm import Session

# Configure Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def _get_certificate_dir() -> Path:
    """Return the certificate template directory."""
    return Path(__file__).resolve().parent.parent.parent / "templates" / "certificate"


def _ensure_certificate_imports():
    """Add certificate dir to path and return render functions."""
    try:
        cert_dir = _get_certificate_dir()
        cert_dir_str = str(cert_dir)
        
        if cert_dir_str not in sys.path:
            sys.path.insert(0, cert_dir_str)
        
        from backend.templates.certificate.render_certificate_combined import render_certificate_combined
        from backend.templates.certificate.render_certificate_combined_no_header_footer import render_certificate_combined_no_header_footer
        
        return render_certificate_combined, render_certificate_combined_no_header_footer
    except ImportError as e:
        logger.error(f"Template Import Error: {e}")
        raise RuntimeError(f"Failed to import certificate templates: {e}")


def _generate_pdf_worker(html: str) -> bytes:
    """
    Runs inside a dedicated thread. 
    This safely isolates Playwright's event loop from FastAPI/Uvicorn's event loop.
    """
    import asyncio
    
    # 1. Safely fix the Windows Uvicorn Asyncio issue
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
        
    # 2. Create a fresh event loop for this background thread
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        # Launch browser
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        # 3. FAST GENERATION: Inject HTML directly from RAM instead of disk files
        # Because we use Base64 images, 'load' is instant (no network requests)
        page.set_content(html, wait_until="load")
        
        # 4. Generate PDF bytes directly
        pdf_bytes = page.pdf(format="A4", print_background=True)
        
        browser.close()
        return pdf_bytes


def _html_to_pdf_fast_playwright(html: str) -> bytes:
    """
    Convert HTML to PDF using a Thread Pool.
    Bypasses the slow `subprocess.run` (Python reboot) and temp file I/O.
    """
    logger.info("Starting FAST Playwright PDF conversion (Threaded)...")
    
    try:
        # Spin up a single background thread to run Playwright
        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(_generate_pdf_worker, html)
            pdf_bytes = future.result()
            
        logger.info(f"PDF generated successfully. Size: {len(pdf_bytes)} bytes")
        return pdf_bytes
        
    except Exception as e:
        logger.error(f"Playwright PDF Generation Failed: {e}")
        logger.error(traceback.format_exc())
        raise RuntimeError(f"PDF Generation Failed: {str(e)}")


def generate_certificate_pdf(
    db: Session,
    certificate_id: int,
    no_header_footer: bool = False,
    cert_service=None,
) -> bytes:
    """
    Generate PDF for a certificate.
    """
    logger.info(f"--- START PDF GENERATION for ID: {certificate_id} ---")

    try:
        if cert_service is None:
            from backend.services.certificate import certificate_service as cert_service

        cert = cert_service.get_certificate_by_id(db, certificate_id)
        if not cert:
            raise ValueError(f"Certificate ID {certificate_id} not found")

        template_data = cert_service.build_template_data(
            db, cert.job_id, certificate=cert, use_data_uris=True
        )

        cert_dir = _get_certificate_dir()
        render_combined, render_no_hf = _ensure_certificate_imports()

        # Render HTML string
        if no_header_footer:
            html = render_no_hf(template_data, output_path=None, template_dir=str(cert_dir))
        else:
            html = render_combined(template_data, output_path=None, template_dir=str(cert_dir))

        # Convert using Threaded Playwright (Instant load)
        return _html_to_pdf_fast_playwright(html)

    except Exception as e:
        logger.error("--- PDF GENERATION FAILED ---")
        if not isinstance(e, (ValueError, RuntimeError)):
            logger.error(traceback.format_exc())
        raise e