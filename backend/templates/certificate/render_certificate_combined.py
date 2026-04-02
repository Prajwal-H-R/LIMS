"""
Standalone render script for Combined Certificate (All 3 Pages)
Can be imported and used in other projects
"""

from jinja2 import Environment, FileSystemLoader
import os
from pathlib import Path
import requests
from typing import Optional, Dict, Any
import sys

# Import shared functions from page1
# Note: Adjust relative import based on your project structure if needed
from .render_certificate_page1 import (
    fetch_inward_equipment,
    map_equipment_to_certificate_data,
    get_certificate_data_from_inward,
    get_empty_data
)


def render_certificate_combined(data, output_path=None, template_dir=None):
    """
    Render combined certificate (all 3 pages) HTML from template and data.
    """
    # 1. Determine the path to the ROOT 'backend/templates' folder
    # Current file is in backend/templates/certificate
    current_file_path = Path(__file__).resolve()
    certificate_folder = current_file_path.parent  # backend/templates/certificate
    
    # Go up one level to get 'backend/templates'
    templates_root = certificate_folder.parent

    # If a custom template_dir is passed, we check if it points to 'certificate' or 'templates'
    if template_dir:
        custom_path = Path(template_dir)
        if custom_path.name == 'certificate':
            templates_root = custom_path.parent
        else:
            templates_root = custom_path

    # 2. Set up Jinja environment pointing to 'backend/templates'
    env = Environment(loader=FileSystemLoader(str(templates_root)))
    
    # 3. Load template using relative path from root
    # This matches the structure expected by {% extends "certificate/base_template.html" %}
    template = env.get_template('certificate/certificate_combined.html')
    
    # Render template with data
    html = template.render(**data)
    
    # Save to file if output_path is provided
    if output_path:
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(html)
        # When saving to file, return None as per docstring
        return None
    
    # Return HTML string
    return html


if __name__ == '__main__':
    # ... existing main block logic ...
    if len(sys.argv) > 1:
        try:
            inward_id = int(sys.argv[1])
            api_url = sys.argv[2] if len(sys.argv) > 2 else "http://localhost:8000/api"
            
            print(f"Fetching inward equipment data for inward_id={inward_id}...")
            data = get_certificate_data_from_inward(inward_id, api_url)
            print("Fetched equipment data from API")
        except ValueError:
            print("Error: Invalid inward_id. Please provide a valid integer inward_id.")
            sys.exit(1)
    else:
        print("Error: inward_id is required.")
        sys.exit(1)
    
    output_file = 'certificate_combined_rendered.html'
    render_certificate_combined(data, output_path=output_file)
    
    print(f"Rendered combined certificate (all 3 pages) -> {output_file}")