import React, { useState } from "react";
import Reports from "./Reports";
import ShiftManagement from "./ShiftManagement";

function AdminDashboard({ billingDate, onLogout, userMode, track }) {
  const [activeSection, setActiveSection] = useState("dashboard");

  const renderContent = () => {
    switch (activeSection) {
      case "dashboard":
        return (
          <div className="admin-content">
            <h2>Admin Dashboard</h2>
            <div className="admin-overview">
              <h3>Admin Overview</h3>
              <div className="overview-content">
                <p>
                  Welcome to the admin panel. Select a section from the sidebar
                  to manage the system.
                </p>
              </div>
            </div>
            <div className="quick-actions">
              <h3>Quick Actions</h3>
              <div className="action-buttons">
                <button onClick={() => setActiveSection("item-master")}>
                  Add Item
                </button>
                <button onClick={() => setActiveSection("reports")}>
                  Generate Report
                </button>
                <button onClick={() => setActiveSection("audit-logs")}>
                  View Audit Logs
                </button>
              </div>
            </div>
            <div className="system-notifications">
              <h3>System Notifications</h3>
              <div className="notifications-content">
                <p>No new notifications</p>
              </div>
            </div>
          </div>
        );

      case "item-master":
        return (
          <div className="admin-content">
            <h2>Item Master</h2>
            <div className="item-master-content">
              <p>Manage menu items here</p>
            </div>
          </div>
        );

      case "parcel-rules":
        return (
          <div className="admin-content">
            <h2>Parcel Rules</h2>
            <div className="parcel-rules-content">
              <p>Configure parcel rules here</p>
            </div>
          </div>
        );

      case "tax-discount":
        return (
          <div className="admin-content">
            <h2>Tax/Discount</h2>
            <div className="tax-discount-content">
              <p>Manage tax and discount settings here</p>
            </div>
          </div>
        );

      case "reports":
        return <Reports billingDate={billingDate} />;

      case "audit-logs":
        return (
          <div className="admin-content">
            <h2>Audit Logs</h2>
            <div className="audit-logs-content">
              <p>View system audit logs here</p>
            </div>
          </div>
        );

      case "shift-management":
        return <ShiftManagement billingDate={billingDate} />;

      default:
        return (
          <div className="admin-content">
            <h2>Admin Dashboard</h2>
          </div>
        );
    }
  };

  return (
    <div className="admin-dashboard-container">
      <div className="admin-header">
        <div className="system-title">Restaurant Billing System</div>
        <button onClick={onLogout} className="logout-btn">
          Logout
        </button>
      </div>

      <div className="admin-main">
        <div className="admin-sidebar">
          <div className="sidebar-items">
            <div
              className={`sidebar-item ${
                activeSection === "dashboard" ? "active" : ""
              }`}
              onClick={() => setActiveSection("dashboard")}
            >
              <span className="sidebar-icon">📊</span>
              <span>Dashboard</span>
            </div>

            <div
              className={`sidebar-item ${
                activeSection === "item-master" ? "active" : ""
              }`}
              onClick={() => setActiveSection("item-master")}
            >
              <span className="sidebar-icon">📝</span>
              <span>Item Master</span>
            </div>

            <div
              className={`sidebar-item ${
                activeSection === "parcel-rules" ? "active" : ""
              }`}
              onClick={() => setActiveSection("parcel-rules")}
            >
              <span className="sidebar-icon">📦</span>
              <span>Parcel Rules</span>
            </div>

            <div
              className={`sidebar-item ${
                activeSection === "tax-discount" ? "active" : ""
              }`}
              onClick={() => setActiveSection("tax-discount")}
            >
              <span className="sidebar-icon">💰</span>
              <span>Tax/Discount</span>
            </div>

            <div
              className={`sidebar-item ${
                activeSection === "reports" ? "active" : ""
              }`}
              onClick={() => setActiveSection("reports")}
            >
              <span className="sidebar-icon">📈</span>
              <span>Reports</span>
            </div>

            <div
              className={`sidebar-item ${
                activeSection === "audit-logs" ? "active" : ""
              }`}
              onClick={() => setActiveSection("audit-logs")}
            >
              <span className="sidebar-icon">📋</span>
              <span>Audit Logs</span>
            </div>

            <div
              className={`sidebar-item ${
                activeSection === "shift-management" ? "active" : ""
              }`}
              onClick={() => setActiveSection("shift-management")}
            >
              <span className="sidebar-icon">⏰</span>
              <span>Shift Management</span>
            </div>
          </div>
        </div>

        <div className="admin-content-area">{renderContent()}</div>
      </div>
    </div>
  );
}

export default AdminDashboard;
