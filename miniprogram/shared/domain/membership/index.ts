export type MembershipPlan = "free" | "vip";

export interface MembershipEntitlement {
  plan: MembershipPlan;
  expiresAt?: number;
}

export interface MembershipAccess {
  isVip: boolean;
  canUseVipThemes: boolean;
  canUseSituationAnalysis: boolean;
}

export const FREE_MEMBERSHIP: MembershipEntitlement = {
  plan: "free"
};

export const FREE_MEMBERSHIP_ACCESS: MembershipAccess = {
  isVip: false,
  canUseVipThemes: false,
  canUseSituationAnalysis: true
};

export function normalizeMembershipEntitlement(
  entitlement?: MembershipEntitlement
): MembershipEntitlement {
  if (entitlement?.plan !== "vip") {
    return { ...FREE_MEMBERSHIP };
  }

  return entitlement.expiresAt === undefined
    ? { plan: "vip" }
    : { plan: "vip", expiresAt: entitlement.expiresAt };
}

export function createMembershipAccess(
  entitlement?: MembershipEntitlement,
  now = Date.now()
): MembershipAccess {
  const normalized = normalizeMembershipEntitlement(entitlement);
  const isVip =
    normalized.plan === "vip" && (normalized.expiresAt === undefined || normalized.expiresAt > now);

  return {
    isVip,
    canUseVipThemes: isVip,
    canUseSituationAnalysis: true
  };
}
