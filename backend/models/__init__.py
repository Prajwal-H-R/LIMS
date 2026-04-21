# This file ensures that all models are imported when the 'models' package is used.

from .users import User
from .customers import Customer
from .inward import Inward

# ... import all your other model classes here ...
from .alembic_versions import AlembicVersion
from .invitations import Invitation
from .notifications import Notification
from .srfs import Srf
from .srf_equipments import SrfEquipment
from .password_reset_token import PasswordResetToken
from .refresh_token import RefreshToken
from .delayed_email_tasks import DelayedEmailTask
from .inward_equipments import InwardEquipment
from .htw.htw_master_standard import HTWMasterStandard
from .htw.htw_manufacturer_spec import HTWManufacturerSpec
from .htw.htw_pressure_gauge_resolution import HTWPressureGaugeResolution
from .htw.htw_nomenclature_range import HTWNomenclatureRange
from .htw.htw_job import HTWJob
from .htw.htw_standard_uncertainty_reference import HTWStandardUncertaintyReference
from .htw.htw_repeatability import HTWRepeatability
from .htw.htw_repetability_reading import HTWRepeatabilityReading
from .htw.htw_reproducibility import HTWReproducibility
from .htw.htw_reproducibility_reading import HTWReproducibilityReading
from .htw.htw_drive_interface_variation import HTWDriveInterfaceVariation
from .htw.htw_drive_interface_variation_reading import HTWDriveInterfaceVariationReading
from .htw.htw_loading_point_variation import HTWLoadingPointVariation
from .htw.htw_loading_point_variation_reading import HTWLoadingPointVariationReading
from .htw.htw_output_drive_variation import HTWOutputDriveVariation
from .htw.htw_output_drive_variation_reading import HTWOutputDriveVariationReading
from .htw.htw_job_environment import HTWJobEnvironment
from .htw.htw_un_resolution import HTWUnResolution
from .htw.htw_uncertainty_budget import HTWUncertaintyBudget
from .htw.htw_un_pg_master import HTWUnPGMaster
from .htw.htw_t_distribution import HTWTDistribution
from .htw.htw_max_val_measure_err import HTWMaxValMeasureErr
from .htw.htw_cmc_reference import HTWCMCReference
from .record_lock import RecordLock
from .certificate.certificate import HTWCertificate
from .htw.htw_job_standard_snapshot import HTWJobStandardSnapshot
from .lab_scope import LabScope
from .deviation import Deviation
from .deviation_attachments import DeviationAttachment
from backend.db import Base