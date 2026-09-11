export function hasAdminFinancialConflict(
  adminId: string,
  buyerId: string,
  delivererId?: string | null,
) {
  return adminId === buyerId || adminId === delivererId;
}
