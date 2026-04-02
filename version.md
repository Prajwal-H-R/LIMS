# Yatharthata LIMS – Phase II  
## Hydraulic Torque Wrench (HTW) Calibration Module

---

## Project Overview

Yatharthata LIMS Phase II focuses on automating the calibration workflow for Hydraulic Torque Wrenches (HTW).  

The system digitizes the complete lifecycle from job creation to certificate issuance, ensuring compliance with ISO 6789-1 standards while maintaining strict data control and operational traceability.

This module replaces Excel-based manual processes with a structured, role-based, and automated system.

---

## Version Details

- **Module:** HTW Calibration Module
- **Phase:** Phase II
- **Version:** 1.0.0
- **Status:** Active Development 
- **Date:** 18-02-2026

---

## System Scope

### Included

- Job creation based on Updated Inward
- Automated measurement data handling
- Master standard and nomenclature management
- Environmental validation
- Calibration calculations (automated)
- Uncertainty budget automation
- Certificate generation (CRT-1, CRT-2, CRT-3)
- License module (subscription-based access control)
- Usage report module (weekly and monthly reports)
- Role-based access control and audit trail

### Not Included

- Billing
- Inventory / lifecycle management
- Mobile application

---

## User Roles

### Engineer (Technician)

- Performs calibration
- Enters measurement readings
- Generates certificate drafts
- Cannot modify formulas, master data, or standards

### Admin

- Manages master standards and reference data
- Controls uncertainty references and CMC scope
- Reviews and approves certificates
- Manages license subscriptions
- Oversees system configuration and access

---

## Key Functional Modules

### 1. Job Management

- Job auto-created upon Updated Inward approval
- One job per equipment
- Job states include:
  - Pending
  - In Progress
  - Completed
  - On Hold
  - Terminated
  - Not Calibrated

---

### 2. Measurement Module

- Auto-populates equipment and operating details
- Allows technicians to enter only required readings
- Validates environmental conditions before processing
- Blocks workflow if validation criteria are not met

---

### 3. Master Standard Management

- Automatic selection of standards based on:
  - Model
  - Range
  - Nomenclature
- Admin-controlled reference tables
- Validity date enforcement
- No calibration allowed with expired standards

---

### 4. Calculation Engine

- Automates:
  - Repeatability
  - Reproducibility
  - Geometric effects
  - Uncertainty evaluation
- Logic strictly aligned with validated Excel models
- Results stored permanently for audit purposes

---

### 5. Certificate Module

- Supports certificate types:
  - CRT-1
  - CRT-2
  - CRT-3
- Workflow:
  - Draft creation by Engineer
  - Review and approval by Admin
  - Final issuance to customer
- Includes:
  - Device details
  - Environmental conditions
  - Calibration results
  - Uncertainty values
  - ULR (editable)
- Full audit trail maintained

---

### 6. License Module

- Subscription-based access control
- Company-level license validation
- Expiry-based feature control
- Usage tracking per organization

---

### 7. Usage Report Module

Generates:

- Weekly usage reports
- Monthly usage reports
- Job activity summaries
- User activity metrics

Designed to provide operational visibility and subscription transparency.

---

## Data & Compliance Controls

- Role-based access enforcement
- Company-level data isolation
- Record-level edit control
- Audit trail maintained for minimum 5 years
- Raw measurement data permanently stored
- All logic aligned with ISO compliance standards

---

## System Constraints

- Calculation logic must match validated Excel references
- Expired standards automatically block calibration
- Technicians cannot modify formulas or master data
- Certificate issuance requires completed job validation
- All workflow transitions are logged

---

## Final Summary

Yatharthata LIMS Phase II delivers a fully automated, standards-compliant calibration module for Hydraulic Torque Wrenches.

The system:

- Automates job lifecycle management
- Digitizes measurement and calculation workflows
- Enforces environmental and standard validity rules
- Generates structured, auditable certificates
- Supports subscription-based licensing
- Provides operational usage reporting

This module ensures accuracy, traceability, compliance, and scalability for laboratory calibration operations.
