/**
 * Route map: `/` opens login; `/signup`; protected `/super-admin`, `/admin`, `/user`.
 * CRM lives under `/admin/crm/*` or `/user/crm/*`; workforce under `/admin/workforce/*` (employees default, chart at `chart`).
 */

import { Navigate, Outlet, Route, Routes } from "react-router-dom";

import { RequireAuth } from "./components/RequireAuth.js";
import { AdminLayout } from "./layouts/AdminLayout.js";
import { SuperLayout } from "./layouts/SuperLayout.js";
import { UserLayout } from "./layouts/UserLayout.js";
import { CrmContactDetailPage } from "./pages/crm/CrmContactDetailPage.js";
import { CrmContactsPage } from "./pages/crm/CrmContactsPage.js";
import { CrmContactEditRedirect, CrmOrganizationEditRedirect } from "./pages/crm/CrmEditRedirects.js";
import { CrmOrganizationDetailPage } from "./pages/crm/CrmOrganizationDetailPage.js";
import { CrmModuleGate } from "./pages/crm/CrmModuleGate.js";
import { CrmOrganizationsPage } from "./pages/crm/CrmOrganizationsPage.js";
import { LoginPage } from "./pages/LoginPage.js";
import { SignupPage } from "./pages/SignupPage.js";
import { AdminHome } from "./pages/admin/AdminHome.js";
import { AdminSystemPage } from "./pages/admin/AdminSystemPage.js";
import { AdminUsersPage } from "./pages/admin/AdminUsersPage.js";
import { AdminWorkforceLayout } from "./pages/workforce/AdminWorkforceLayout.js";
import { AdminWorkforceOrgChartPage } from "./pages/workforce/AdminWorkforceOrgChartPage.js";
import { AdminWorkforceOrganizationsPage } from "./pages/workforce/AdminWorkforceOrganizationsPage.js";
import { AdminSalesLayout } from "./pages/sales/AdminSalesLayout.js";
import { SalesBdrPage } from "./pages/sales/SalesBdrPage.js";
import { SalesModuleGate } from "./pages/sales/SalesModuleGate.js";
import { SalesPipelinePage } from "./pages/sales/SalesPipelinePage.js";
import { SalesContactRolesSettingsPage } from "./pages/sales/SalesContactRolesSettingsPage.js";
import { SalesFunnelRecordsPage } from "./pages/sales/SalesFunnelRecordsPage.js";
import { SalesFunnelRecordDetailPage } from "./pages/sales/SalesFunnelRecordDetailPage.js";
import { HrmModuleGate } from "./pages/workforce/HrmModuleGate.js";
import { CompanySubscriptionDetailPage } from "./pages/company-subscriptions/CompanySubscriptionDetailPage.js";
import { CompanySubscriptionsModuleGate } from "./pages/company-subscriptions/CompanySubscriptionsModuleGate.js";
import { CompanySubscriptionsOverviewPage } from "./pages/company-subscriptions/CompanySubscriptionsOverviewPage.js";
import { InvoicingCatalogPage } from "./pages/invoicing/InvoicingCatalogPage.js";
import { InvoicingConfigurationPage } from "./pages/invoicing/InvoicingConfigurationPage.js";
import { AdminInvoicingHubLayout } from "./pages/invoicing/AdminInvoicingHubLayout.js";
import { InvoicingModuleGate } from "./pages/invoicing/InvoicingModuleGate.js";
import { InvoicingOverviewPage } from "./pages/invoicing/InvoicingOverviewPage.js";
import { InvoicingPaymentsOverviewPage } from "./pages/invoicing/InvoicingPaymentsOverviewPage.js";
import { InvoicingInvoiceDetailPage } from "./pages/invoicing/InvoicingInvoiceDetailPage.js";
import { InvoicingOfferDetailPage } from "./pages/invoicing/InvoicingOfferDetailPage.js";
import { InvoicingQuoteDetailPage } from "./pages/invoicing/InvoicingQuoteDetailPage.js";
import { InvoicingQuoteFormPage } from "./pages/invoicing/InvoicingQuoteFormPage.js";
import { InvoicingPublicOfferResponsePage } from "./pages/invoicing/InvoicingPublicOfferResponsePage.js";
import { MailboxAccountsPage } from "./pages/mailbox/MailboxAccountsPage.js";
import { MailboxCalendarPage } from "./pages/mailbox/MailboxCalendarPage.js";
import { MailboxComposePage } from "./pages/mailbox/MailboxComposePage.js";
import { MailboxInboxPage } from "./pages/mailbox/MailboxInboxPage.js";
import { MailboxLayout } from "./pages/mailbox/MailboxLayout.js";
import { MailboxModuleGate } from "./pages/mailbox/MailboxModuleGate.js";
import { WorkforceEmployeeDetailPage } from "./pages/workforce/WorkforceEmployeeDetailPage.js";
import {
  WorkforceEmployeeEditRouteRedirect,
  WorkforceEmployeeNewRouteRedirect
} from "./pages/workforce/WorkforceEmployeeModalRouteRedirects.js";
import { WorkforceEmployeesListPage } from "./pages/workforce/WorkforceEmployeesListPage.js";
import { AccountSettingsPage } from "./pages/settings/AccountSettingsPage.js";
import { SuperHome } from "./pages/super/SuperHome.js";
import { SuperFeaturesPage } from "./pages/super/SuperFeaturesPage.js";
import { SuperIntegrationsPage } from "./pages/super/SuperIntegrationsPage.js";
import { SuperSubscriptionsPage } from "./pages/super/SuperSubscriptionsPage.js";
import { SuperJobsPage } from "./pages/super/SuperJobsPage.js";
import { SuperMailPage } from "./pages/super/SuperMailPage.js";
import { SuperUsersPage } from "./pages/super/SuperUsersPage.js";
import { UserHome } from "./pages/user/UserHome.js";
import { UserProfile } from "./pages/user/UserProfile.js";

export const App = () => (
  <Routes>
    <Route path="/" element={<Navigate to="/login" replace />} />
    <Route path="/login" element={<LoginPage />} />
    <Route path="/signup" element={<SignupPage />} />
    <Route path="/offer/respond/:token" element={<InvoicingPublicOfferResponsePage />} />
    <Route element={<RequireAuth roles={["super_admin"]} />}>
      <Route path="/super-admin" element={<SuperLayout />}>
        <Route index element={<SuperHome />} />
        <Route path="users" element={<SuperUsersPage />} />
        <Route path="jobs" element={<SuperJobsPage />} />
        <Route path="integrations" element={<SuperIntegrationsPage />} />
        <Route path="subscriptions" element={<SuperSubscriptionsPage />} />
        <Route path="features" element={<SuperFeaturesPage />} />
        <Route path="mail" element={<SuperMailPage />} />
        <Route path="settings" element={<AccountSettingsPage />} />
      </Route>
    </Route>

    <Route element={<RequireAuth roles={["tenant_admin"]} />}>
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminHome />} />
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="system" element={<AdminSystemPage />} />
        <Route path="settings" element={<AccountSettingsPage />} />
        <Route path="sales" element={<SalesModuleGate />}>
          <Route element={<AdminSalesLayout />}>
            <Route index element={<Navigate to="bdr" replace />} />
            <Route path="bdr" element={<SalesBdrPage />} />
            <Route path="bdr/leads/:id" element={<SalesFunnelRecordDetailPage kind="lead" />} />
            <Route path="records" element={<SalesFunnelRecordsPage />} />
            <Route path="pipeline" element={<SalesPipelinePage />} />
            <Route path="pipeline/deals/:id" element={<SalesFunnelRecordDetailPage kind="deal" />} />
            <Route path="settings" element={<SalesContactRolesSettingsPage />} />
          </Route>
        </Route>
        <Route path="workforce" element={<HrmModuleGate />}>
          <Route element={<AdminWorkforceLayout />}>
            <Route index element={<Navigate to="employees" replace />} />
            <Route path="chart" element={<AdminWorkforceOrgChartPage />} />
            <Route path="organization" element={<AdminWorkforceOrganizationsPage />} />
            <Route path="organizations" element={<Navigate to="/admin/workforce/organization" replace />} />
            <Route path="org-units" element={<Navigate to="/admin/workforce/chart" replace />} />
            <Route path="employees" element={<WorkforceEmployeesListPage />} />
            <Route path="employees/new" element={<WorkforceEmployeeNewRouteRedirect />} />
            <Route path="employees/:id/edit" element={<WorkforceEmployeeEditRouteRedirect />} />
            <Route path="employees/:id" element={<WorkforceEmployeeDetailPage />} />
          </Route>
        </Route>
        <Route path="company-subscriptions" element={<CompanySubscriptionsModuleGate />}>
          <Route index element={<CompanySubscriptionsOverviewPage />} />
          <Route path="providers/:id" element={<CompanySubscriptionDetailPage />} />
        </Route>
        <Route path="invoicing" element={<InvoicingModuleGate />}>
          <Route element={<AdminInvoicingHubLayout />}>
            <Route index element={<InvoicingOverviewPage />} />
            <Route path="payments" element={<InvoicingPaymentsOverviewPage />} />
            <Route path="configuration" element={<InvoicingConfigurationPage />} />
            <Route path="catalog" element={<InvoicingCatalogPage />} />
          </Route>
          <Route path="quotes/new" element={<InvoicingQuoteFormPage />} />
          <Route path="quotes/:quoteId/edit" element={<InvoicingQuoteFormPage />} />
          <Route path="quotes/:quoteId" element={<InvoicingQuoteDetailPage />} />
          <Route path="offers/:offerId" element={<InvoicingOfferDetailPage />} />
          <Route path="invoices/:invoiceId" element={<InvoicingInvoiceDetailPage />} />
        </Route>
        <Route path="mailbox" element={<MailboxModuleGate />}>
          <Route element={<MailboxLayout />}>
            <Route index element={<MailboxInboxPage />} />
            <Route path="accounts" element={<MailboxAccountsPage />} />
            <Route path="calendar" element={<MailboxCalendarPage />} />
            <Route path="compose" element={<MailboxComposePage />} />
            <Route path="compose/:draftId" element={<MailboxComposePage />} />
          </Route>
        </Route>
        <Route path="crm" element={<CrmModuleGate />}>
          <Route index element={<Navigate to="organizations" replace />} />
          <Route path="organizations" element={<CrmOrganizationsPage />} />
          <Route path="organizations/new" element={<Navigate to=".." replace />} />
          <Route path="organizations/:id/edit" element={<CrmOrganizationEditRedirect />} />
          <Route path="organizations/:id" element={<CrmOrganizationDetailPage />} />
          <Route path="contacts" element={<CrmContactsPage />} />
          <Route path="contacts/new" element={<Navigate to=".." replace />} />
          <Route path="contacts/:id/edit" element={<CrmContactEditRedirect />} />
          <Route path="contacts/:id" element={<CrmContactDetailPage />} />
          <Route path="segmentation" element={<Navigate to="/admin/system?tab=marketSegments" replace />} />
        </Route>
      </Route>
    </Route>

    <Route element={<RequireAuth roles={["tenant_user"]} />}>
      <Route path="/user" element={<UserLayout />}>
        <Route index element={<UserHome />} />
        <Route path="profile" element={<UserProfile />} />
        <Route path="settings" element={<AccountSettingsPage />} />
        <Route path="crm" element={<CrmModuleGate />}>
          <Route index element={<Navigate to="organizations" replace />} />
          <Route path="organizations" element={<CrmOrganizationsPage />} />
          <Route path="organizations/new" element={<Navigate to=".." replace />} />
          <Route path="organizations/:id/edit" element={<CrmOrganizationEditRedirect />} />
          <Route path="organizations/:id" element={<CrmOrganizationDetailPage />} />
          <Route path="contacts" element={<CrmContactsPage />} />
          <Route path="contacts/new" element={<Navigate to=".." replace />} />
          <Route path="contacts/:id/edit" element={<CrmContactEditRedirect />} />
          <Route path="contacts/:id" element={<CrmContactDetailPage />} />
          <Route path="segmentation" element={<Navigate to="../organizations" replace />} />
        </Route>
      </Route>
    </Route>

    <Route path="*" element={<Navigate to="/login" replace />} />
  </Routes>
);
