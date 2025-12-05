-- =====================================================
-- FIX DRIVE_ASSIGNMENTS TO USE VENDORS TABLE
-- Run this in Supabase SQL Editor AFTER running SETUP_VENDORS.sql
-- =====================================================

-- Step 1: Drop the existing foreign key constraint on vendor_id
ALTER TABLE drive_assignments 
DROP CONSTRAINT IF EXISTS drive_assignments_vendor_id_fkey;

-- Step 2: Change vendor_id to reference vendors table instead of profiles
-- First, let's add a new constraint that allows NULL (for migration)
ALTER TABLE drive_assignments
ALTER COLUMN vendor_id DROP NOT NULL;

-- Step 3: Add new foreign key to vendors table
ALTER TABLE drive_assignments
ADD CONSTRAINT drive_assignments_vendor_id_fkey 
FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL;

-- Step 4: Make vendor_id NOT NULL again (after migration)
-- Note: Only run this after all existing assignments have valid vendor_ids
-- ALTER TABLE drive_assignments ALTER COLUMN vendor_id SET NOT NULL;

-- Verify the change
SELECT 
    tc.constraint_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_name = 'drive_assignments' 
    AND tc.constraint_type = 'FOREIGN KEY';






