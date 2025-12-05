-- =================================================================
-- Function: increment_qc_usage
-- Description: Atomically increments the QC series count for a given
--              organisation for the current month.
--              Creates a new usage record if one doesn't exist.
-- =================================================================

CREATE OR REPLACE FUNCTION increment_qc_usage(p_organisation_id UUID, p_increment_by INT)
RETURNS void AS $$
DECLARE
    v_period_start DATE;
    v_period_end DATE;
BEGIN
    -- Set the start and end of the current month
    v_period_start := date_trunc('month', NOW())::DATE;
    v_period_end := (date_trunc('month', NOW()) + interval '1 month - 1 day')::DATE;

    -- Atomically insert or update the usage record
    INSERT INTO qc_usage_monthly (organisation_id, period_start, period_end, series_count)
    VALUES (p_organisation_id, v_period_start, v_period_end, p_increment_by)
    ON CONFLICT (organisation_id, period_start)
    DO UPDATE SET
        series_count = qc_usage_monthly.series_count + p_increment_by,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Grant execution permission to the authenticated role
GRANT EXECUTE ON FUNCTION increment_qc_usage(UUID, INT) TO authenticated;
