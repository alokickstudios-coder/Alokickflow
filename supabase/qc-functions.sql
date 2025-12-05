CREATE OR REPLACE FUNCTION select_and_mark_qc_jobs(batch_size INT)
RETURNS SETOF qc_jobs AS $$
DECLARE
    job_ids UUID[];
BEGIN
    -- Find and lock a batch of jobs
    SELECT ARRAY(
        SELECT id FROM qc_jobs
        WHERE status IN ('queued', 'pending')
        ORDER BY created_at
        LIMIT batch_size
        FOR UPDATE SKIP LOCKED
    ) INTO job_ids;

    -- Mark them as running
    UPDATE qc_jobs
    SET status = 'running', started_at = NOW()
    WHERE id = ANY(job_ids);

    -- Return the jobs that were marked
    RETURN QUERY
    SELECT * FROM qc_jobs
    WHERE id = ANY(job_ids);
END;
$$ LANGUAGE plpgsql;
