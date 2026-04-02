# backend/services/certificate_pdf_service.py
"""Generate certificate PDF using certificate folder templates."""

import sys
import tempfile
import logging
import traceback
import subprocess
import os
from pathlib import Path

from sqlalchemy.orm import Session

# Configure Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- ISOLATED SCRIPT FOR PDF GENERATION ---
# We write this to a temp file and execute it to bypass Uvicorn's event loop limitations on Windows
PDF_GENERATOR_SCRIPT = r"""
import sys
import asyncio
from pathlib import Path

def generate(input_html, output_pdf):
    # CRITICAL: Force Proactor Loop on Windows
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        # Convert path to URI
        file_uri = Path(input_html).as_uri()
        page.goto(file_uri, wait_until="networkidle")
        page.pdf(path=output_pdf, format="A4", print_background=True)
        browser.close()

if __name__ == "__main__":
    try:
        generate(sys.argv[1], sys.argv[2])
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
"""

def _get_certificate_dir() -> Path:
    """Return the certificate template directory."""
    # Calculates path: backend/services/../../templates/certificate
    path = Path(__file__).resolve().parent.parent.parent / "templates" / "certificate"
    return path


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


def _html_to_pdf_playwright(html: str, cert_dir: Path) -> bytes:
    """
    Convert HTML to PDF using an ISOLATED Python process.
    This bypasses the 'NotImplementedError' caused by Uvicorn's event loop on Windows.
    """
    logger.info("Starting PDF conversion (Isolated Process)...")
    
    # 1. Create Temporary Files
    # We need 3 files: The HTML content, The Python Script to run, and the Output PDF container
    temp_dir = tempfile.gettempdir()
    
    # Valid cert_dir for assets
    if not cert_dir.exists():
        cert_dir = Path(temp_dir)

    try:
        # A. Write HTML Content
        with tempfile.NamedTemporaryFile(mode="w", suffix=".html", dir=str(cert_dir), delete=False, encoding="utf-8") as html_file:
            html_file.write(html)
            html_path = html_file.name

        # B. Define Output PDF Path
        output_pdf_path = html_path.replace(".html", ".pdf")

        # C. Write the Generator Script
        script_path = os.path.join(temp_dir, "generate_pdf_script.py")
        with open(script_path, "w", encoding="utf-8") as script_file:
            script_file.write(PDF_GENERATOR_SCRIPT)

        logger.info(f"Executing isolated PDF generation script...")
        logger.info(f"Input: {html_path}")

        # 2. Run the subprocess
        # We use sys.executable to ensure we use the same Python environment (venv)
        result = subprocess.run(
            [sys.executable, script_path, html_path, output_pdf_path],
            capture_output=True,
            text=True
        )

        # 3. Check for errors
        if result.returncode != 0:
            logger.error("Subprocess Error Output:")
            logger.error(result.stderr)
            raise RuntimeError(f"Playwright Subprocess Failed: {result.stderr}")

        # 4. Read the generated PDF
        if not os.path.exists(output_pdf_path):
             raise RuntimeError("PDF file was not created by the subprocess.")

        with open(output_pdf_path, "rb") as pdf_file:
            pdf_bytes = pdf_file.read()

        logger.info(f"PDF generated successfully. Size: {len(pdf_bytes)} bytes")
        return pdf_bytes

    except Exception as e:
        logger.error(f"PDF Generation Failed: {e}")
        logger.error(traceback.format_exc())
        raise RuntimeError(f"PDF Generation Failed: {str(e)}")

    finally:
        # 5. Cleanup Temporary Files
        try:
            if 'html_path' in locals() and os.path.exists(html_path):
                os.remove(html_path)
            if 'output_pdf_path' in locals() and os.path.exists(output_pdf_path):
                os.remove(output_pdf_path)
            if 'script_path' in locals() and os.path.exists(script_path):
                os.remove(script_path)
        except Exception as e:
            logger.warning(f"Cleanup warning: {e}")


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

        if no_header_footer:
            html = render_no_hf(template_data, output_path=None, template_dir=str(cert_dir))
        else:
            html = render_combined(template_data, output_path=None, template_dir=str(cert_dir))

        return _html_to_pdf_playwright(html, cert_dir)

    except Exception as e:
        logger.error("--- PDF GENERATION FAILED ---")
        if not isinstance(e, (ValueError, RuntimeError)):
            logger.error(traceback.format_exc())
        raise e