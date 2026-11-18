import { describe, expect, it } from "vitest";
import {
  createMembershipAccess,
  normalizeMembershipEntitlement
} from "../../miniprogram/shared/domain/membership";

describe("会员权限模型", () => {
  it("将旧用户和未知状态按免费用户处理", () => {
    expect(normalizeMembershipEntitlement()).toEqual({ plan: "free" });
    expect(createMembershipAccess()).toEqual({
      isVip: false,
      canUseVipThemes: false,
      canUseSituationAnalysis: true
    });
  });

  it("为有效 VIP 开启主题和局势分析权限", () => {
    expect(createMembershipAccess({ plan: "vip", expiresAt: 2000 }, 1000)).toEqual({
      isVip: true,
      canUseVipThemes: true,
      canUseSituationAnalysis: true
    });
    expect(createMembershipAccess({ plan: "vip" }, 1000).isVip).toBe(true);
  });

  it("VIP 到期后自动回落为免费权限", () => {
    expect(createMembershipAccess({ plan: "vip", expiresAt: 1000 }, 1000)).toEqual({
      isVip: false,
      canUseVipThemes: false,
      canUseSituationAnalysis: true
    });
  });
});
