# End-to-End Test Plan

## Test Environment Setup

### 1. Database Migration Check
- [ ] Run `/api/setup/migrate-stages` to verify `project_stages` table exists
- [ ] If not, run `supabase/project-stages.sql` in Supabase SQL Editor

### 2. Prerequisites
- [ ] User logged in (alokickstudios@gmail.com)
- [ ] Organization exists and is set to "enterprise" tier
- [ ] At least one project exists
- [ ] At least one team member (non-vendor) exists in profiles

---

## Test Scenarios

### Test 1: Database Schema Verification
**Endpoint:** `GET /api/setup/migrate-stages`

**Expected Result:**
- Returns status of `project_stages` table
- If missing, provides instructions to run SQL

---

### Test 2: Project Stages API - GET (List Stages)
**Endpoint:** `GET /api/project-stages?organizationId={orgId}`

**Test Steps:**
1. Call GET endpoint with organizationId
2. Verify response includes stages array
3. Verify default stages are created for all projects

**Expected Result:**
- Returns array of stages
- Each project should have 4 default stages: translation, dubbing, mixing, subtitling
- All stages should have status "pending"

---

### Test 3: Project Stages API - GET (Filter by Project)
**Endpoint:** `GET /api/project-stages?organizationId={orgId}&projectId={projectId}`

**Test Steps:**
1. Call GET endpoint with both organizationId and projectId
2. Verify response includes only stages for that project

**Expected Result:**
- Returns 4 stages for the specified project
- Stages: translation, dubbing, mixing, subtitling

---

### Test 4: Project Stages API - POST (Create/Update Stage)
**Endpoint:** `POST /api/project-stages`

**Test Steps:**
1. Send POST with projectId, organizationId, stage
2. Verify stage is created/updated

**Expected Result:**
- Returns success: true
- Stage is created with status "pending"

---

### Test 5: Project Stages API - PATCH (Update Stage Status)
**Endpoint:** `PATCH /api/project-stages`

**Test Steps:**
1. Update stage status to "in_progress"
2. Update stage status to "completed"
3. Verify completed_at timestamp is set

**Expected Result:**
- Status updates successfully
- When completed, completed_at is set
- When not completed, completed_at is null

---

### Test 6: Project Stages API - PATCH (Assign Team Member)
**Endpoint:** `PATCH /api/project-stages`

**Test Steps:**
1. Assign a team member to a stage
2. Verify assignment is saved
3. Unassign (set to null)
4. Verify unassignment works

**Expected Result:**
- assigned_to field updates correctly
- Can assign and unassign team members

---

### Test 7: Projects Page - Load Stages
**Page:** `/dashboard/projects`

**Test Steps:**
1. Navigate to projects page
2. Verify stages are loaded for each project
3. Verify stage UI components render

**Expected Result:**
- Projects page loads without errors
- Each project shows 4 stages
- Stage status indicators display correctly

---

### Test 8: Projects Page - Update Project Status
**Page:** `/dashboard/projects`

**Test Steps:**
1. Click status dropdown on a project
2. Change status from "active" to "completed"
3. Verify status updates in database
4. Verify UI reflects change

**Expected Result:**
- Status dropdown works
- Project status updates via PATCH /api/projects
- UI updates immediately

---

### Test 9: Projects Page - Update Stage Status
**Page:** `/dashboard/projects`

**Test Steps:**
1. Click stage status dropdown
2. Change status from "pending" to "in_progress"
3. Change status to "completed"
4. Verify updates via API

**Expected Result:**
- Stage status updates correctly
- Completed stages show completion timestamp
- UI reflects changes immediately

---

### Test 10: Projects Page - Assign Team Member to Stage
**Page:** `/dashboard/projects`

**Test Steps:**
1. Click "Assign" button on a stage
2. Select a team member from dropdown
3. Verify assignment is saved
4. Verify assigned member displays in UI

**Expected Result:**
- Team member dropdown shows available members
- Assignment saves via PATCH /api/project-stages
- UI shows assigned member name

---

### Test 11: Projects Page - Begin QC Button Logic
**Page:** `/dashboard/projects`

**Test Steps:**
1. With project status = "active" → Button should show error
2. With project status = "completed" but stages incomplete → Button should show error
3. With project status = "completed" AND all stages completed → Button should work
4. With subscription = "free" → Button should redirect to settings

**Expected Result:**
- Button logic correctly checks:
  - Project status === "completed"
  - All 4 stages status === "completed"
  - Subscription tier is Pro or Enterprise
- Appropriate error messages shown

---

### Test 12: Complete Workflow - Full Production Cycle
**Flow:** Create Project → Assign Stages → Complete Stages → Mark Project Complete → Begin QC

**Test Steps:**
1. Create a new project
2. Verify 4 default stages are created automatically
3. Assign team members to each stage
4. Mark each stage as "in_progress"
5. Mark each stage as "completed"
6. Update project status to "completed"
7. Click "Begin QC" button
8. Verify navigation to Bulk QC page with project context

**Expected Result:**
- All steps complete successfully
- No errors in console
- Database reflects all changes
- Bulk QC page receives project context

---

## Test Execution Commands

### Check Database Migration
```bash
curl -X GET http://localhost:3000/api/setup/migrate-stages
```

### Test API Endpoints (replace {orgId} and {projectId})
```bash
# Get all stages
curl -X GET "http://localhost:3000/api/project-stages?organizationId={orgId}"

# Get stages for specific project
curl -X GET "http://localhost:3000/api/project-stages?organizationId={orgId}&projectId={projectId}"

# Create/update stage
curl -X POST http://localhost:3000/api/project-stages \
  -H "Content-Type: application/json" \
  -d '{"projectId":"{projectId}","organizationId":"{orgId}","stage":"translation"}'

# Update stage status
curl -X PATCH http://localhost:3000/api/project-stages \
  -H "Content-Type: application/json" \
  -d '{"projectId":"{projectId}","stage":"translation","status":"completed"}'

# Assign team member
curl -X PATCH http://localhost:3000/api/project-stages \
  -H "Content-Type: application/json" \
  -d '{"projectId":"{projectId}","stage":"translation","assignedTo":"{userId}"}'
```

---

## Expected Issues & Fixes

### Issue 1: Table doesn't exist
**Fix:** Run `supabase/project-stages.sql` in Supabase SQL Editor

### Issue 2: Stages not auto-created
**Fix:** GET endpoint should auto-create stages, verify `ensureDefaultStages` function

### Issue 3: Team members not loading
**Fix:** Verify profiles query excludes vendors (role !== 'vendor')

### Issue 4: Begin QC button not working
**Fix:** Verify all 4 stages are completed, project status is "completed", subscription tier check

---

## Success Criteria

✅ All API endpoints return correct responses  
✅ Database operations succeed  
✅ Frontend UI updates correctly  
✅ Stage management workflow completes end-to-end  
✅ Bulk QC gating logic works correctly  
✅ No console errors  
✅ No TypeScript errors  
✅ No linting errors



