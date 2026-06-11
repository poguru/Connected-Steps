import { test as base, expect } from "@playwright/test";
import { ApiHelper } from "../utils/api-helper";
import { DbHelper } from "../utils/db-helper";
import { AuthPage } from "../pages/AuthPage";
import { DashboardPage } from "../pages/DashboardPage";
import { SessionsPage } from "../pages/SessionsPage";
import { MembershipPage } from "../pages/MembershipPage";
import { CommunityPage } from "../pages/CommunityPage";
import { LeaderboardPage } from "../pages/LeaderboardPage";
import { AdminPage } from "../pages/AdminPage";
import { ProfilePage } from "../pages/ProfilePage";
import { CoachPage } from "../pages/CoachPage";

type Fixtures = {
  api:          ApiHelper;
  db:           typeof DbHelper;
  authPage:     AuthPage;
  dashboardPage:DashboardPage;
  sessionsPage: SessionsPage;
  membershipPage:MembershipPage;
  communityPage: CommunityPage;
  leaderboardPage:LeaderboardPage;
  adminPage:    AdminPage;
  profilePage:  ProfilePage;
  coachPage:    CoachPage;
};

export const test = base.extend<Fixtures>({
  api: async ({ request }, use) => {
    await use(new ApiHelper(request));
  },
  db: async ({}, use) => {
    await use(DbHelper);
  },
  authPage: async ({ page }, use) => {
    await use(new AuthPage(page));
  },
  dashboardPage: async ({ page }, use) => {
    await use(new DashboardPage(page));
  },
  sessionsPage: async ({ page }, use) => {
    await use(new SessionsPage(page));
  },
  membershipPage: async ({ page }, use) => {
    await use(new MembershipPage(page));
  },
  communityPage: async ({ page }, use) => {
    await use(new CommunityPage(page));
  },
  leaderboardPage: async ({ page }, use) => {
    await use(new LeaderboardPage(page));
  },
  adminPage: async ({ page }, use) => {
    await use(new AdminPage(page));
  },
  profilePage: async ({ page }, use) => {
    await use(new ProfilePage(page));
  },
  coachPage: async ({ page }, use) => {
    await use(new CoachPage(page));
  },
});

export { expect };
