UPDATE sessions SET expires_at=last_accessed+interval '7 days' WHERE last_accessed IS NOT NULL AND expires_at<last_accessed+interval '7 days';
