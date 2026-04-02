from sqlalchemy import Column, Integer, String, Date, DateTime
from sqlalchemy.sql import func
from backend.db import Base


class ReportLog(Base):
    __tablename__ = "report_log"

    id = Column(Integer, primary_key=True, index=True)
    report_type = Column(String(20), nullable=False)  # weekly / monthly
    last_sent_date = Column(Date, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
