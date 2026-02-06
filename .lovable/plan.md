
# Plan: Add IT and Marketing Roles

## Overview
This plan adds two new user roles (**IT** and **Marketing**) to the existing role-based access control (RBAC) system. The current system has 4 roles: `sales`, `supply_chain`, `admin`, and `finance`. After this change, there will be 6 roles.

---

## What Will Change

### New Roles
| Role | Description |
|------|-------------|
| **IT** | Technical team - system access and configuration |
| **Marketing** | Marketing team - campaigns and content management |

### Access Permissions
Both new roles will have access to:
- Dashboard (Home)
- Tasks
- Tickets  
- HR
- Meetings
- Expenses
- Forms
- Repairs
- Training
- Billing
- Orders (view access)

---

## Implementation Steps

### Step 1: Database Migration
Add the new roles to the `app_role` enum in the database.

```sql
ALTER TYPE app_role ADD VALUE 'it';
ALTER TYPE app_role ADD VALUE 'marketing';
```

Also update the `notice_visibility` enum to include the new roles:
```sql
ALTER TYPE notice_visibility ADD VALUE 'it';
ALTER TYPE notice_visibility ADD VALUE 'marketing';
```

---

### Step 2: Update Authentication Type Definition
Modify `src/hooks/useAuth.tsx` to include the new roles in the TypeScript type:

```typescript
type AppRole = "sales" | "supply_chain" | "admin" | "finance" | "it" | "marketing";
```

---

### Step 3: Update Registration Form
Modify `src/pages/Auth.tsx` to add radio buttons for the new roles:

```tsx
<div className="flex items-center space-x-3 p-3 rounded-lg ...">
  <RadioGroupItem value="it" id="it" />
  <Label htmlFor="it" className="cursor-pointer flex-1">
    <span className="font-medium">IT Team</span>
    <p className="text-sm text-muted-foreground">
      System administration and technical support
    </p>
  </Label>
</div>

<div className="flex items-center space-x-3 p-3 rounded-lg ...">
  <RadioGroupItem value="marketing" id="marketing" />
  <Label htmlFor="marketing" className="cursor-pointer flex-1">
    <span className="font-medium">Marketing Team</span>
    <p className="text-sm text-muted-foreground">
      Campaigns and content management
    </p>
  </Label>
</div>
```

---

### Step 4: Update Invite User Dialog
Modify `src/components/admin/InviteUserDialog.tsx`:

1. Add new options to the role select dropdown
2. Update the `getRoleLabel` function

```tsx
// In the Select component
<SelectItem value="it">IT Team</SelectItem>
<SelectItem value="marketing">Marketing Team</SelectItem>

// In getRoleLabel function
case "it":
  return "IT Team";
case "marketing":
  return "Marketing Team";
```

---

### Step 5: Update Header Navigation
Modify `src/components/Header.tsx`:

1. Add new roles to navigation item role arrays
2. Update `getRoleLabel` function

```typescript
const getRoleLabel = (role: string | null) => {
  switch (role) {
    // ... existing cases
    case "it":
      return "IT";
    case "marketing":
      return "Marketing";
    default:
      return "User";
  }
};

// Update nav items to include new roles where appropriate
{ path: "/", label: "Dashboard", roles: ["sales", "supply_chain", "admin", "finance", "it", "marketing"] },
{ path: "/tasks", label: "Tasks", roles: ["sales", "supply_chain", "admin", "finance", "it", "marketing"] },
// ... etc
```

---

### Step 6: Update Mobile Navigation
Modify `src/components/MobileBottomNav.tsx` to include the new roles in the `roles` arrays.

---

### Step 7: Update Notification Panel Access
Modify `src/components/Header.tsx` to optionally show notifications for IT/Marketing:

```tsx
{(role === 'admin' || role === 'supply_chain' || role === 'finance' || role === 'it') && (
  <NotificationPanel />
)}
```

---

### Step 8: Update Task Components
Update the role types in these files:
- `src/hooks/useTasks.ts`
- `src/components/tasks/TasksPanel.tsx`
- `src/components/tasks/TaskTableView.tsx`
- `src/components/tasks/TaskFormDialog.tsx`

---

### Step 9: Update Ticket Components
Update role types in:
- `src/hooks/useTickets.ts`
- `src/components/tickets/TicketFilters.tsx`
- `src/components/tickets/TicketFormDialog.tsx`

---

## Files to Modify

| File | Changes |
|------|---------|
| Database | Add values to `app_role` and `notice_visibility` enums |
| `src/hooks/useAuth.tsx` | Update `AppRole` type |
| `src/pages/Auth.tsx` | Add new role radio buttons, update type |
| `src/components/admin/InviteUserDialog.tsx` | Add select options, update label function |
| `src/components/Header.tsx` | Update nav roles arrays, add label cases |
| `src/components/MobileBottomNav.tsx` | Update nav roles arrays |
| `src/hooks/useTasks.ts` | Update role type |
| `src/components/tasks/TasksPanel.tsx` | Update role type |
| `src/components/tasks/TaskTableView.tsx` | Update role type |
| `src/components/tasks/TaskFormDialog.tsx` | Update role type |
| `src/hooks/useTickets.ts` | Update role type |
| `src/components/tickets/TicketFilters.tsx` | Update role type |
| `src/components/tickets/TicketFormDialog.tsx` | Update role type |

---

## Technical Details

### Database Enum Extension
PostgreSQL allows adding new values to an existing enum type using `ALTER TYPE ... ADD VALUE`. This is non-destructive and won't affect existing data.

### Type Sync
After the database migration, the `src/integrations/supabase/types.ts` file will automatically regenerate to include the new enum values. All TypeScript types will then recognize `'it'` and `'marketing'` as valid roles.

### RLS Policies
Existing RLS policies use the `has_role()` function which will automatically work with the new role values since they query the `user_roles` table dynamically.

---

## Testing Checklist
After implementation:
- [ ] New user can register with IT role
- [ ] New user can register with Marketing role  
- [ ] Admin can invite users with IT/Marketing roles
- [ ] IT/Marketing users see correct navigation items
- [ ] Tasks can be assigned to IT/Marketing users
- [ ] Tickets can be raised by/assigned to IT/Marketing users
- [ ] Role labels display correctly in header and profile

