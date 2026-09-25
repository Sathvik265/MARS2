import React from "react";

// ================== Card Components ==================

export const Card = ({ children, className = "" }) => (
  <div
    className={`bg-white shadow-md rounded-lg border border-gray-200 ${className}`}
    style={{
      background: "#1c1c1e",
      border: "1px solid #2a2a2e",
      borderRadius: "0.85rem",
      boxShadow: "0 4px 24px rgba(0,0,0,0.35)",
    }}
  >
    {children}
  </div>
);

export const CardHeader = ({ children }) => (
  <div
    className="px-6 py-4 border-b border-gray-200"
    style={{ borderBottom: "1px solid #2e2e32" }}
  >
    {children}
  </div>
);

export const CardTitle = ({ children, className = "" }) => (
  <div className={`text-lg font-semibold text-gray-900 ${className}`}>
    <h3>{children}</h3>
  </div>
);

export const CardContent = ({ children, className = "" }) => (
  <div className={`px-6 py-4 ${className}`}>{children}</div>
);

// ================== Form Components ==================

export const Input = React.forwardRef(({ className = "", ...props }, ref) => (
  <input
    ref={ref}
    className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-black ${className}`}
    {...props}
  />
));

export const DDMMYYYYInput = ({ value, onChange, className = "", placeholder = "DD/MM/YYYY", readOnly = false }) => {
  const dateInputRef = React.useRef(null);

  const formatDateDisplay = (val) => {
    if (!val) return "";
    if (typeof val === "string" && val.includes("-")) {
      const parts = val.split("-");
      if (parts.length === 3) {
        return `${parts[2].padStart(2, "0")}/${parts[1].padStart(2, "0")}/${parts[0]}`;
      }
    }
    return val;
  };

  const displayVal = formatDateDisplay(value);

  return (
    <div className="relative w-full">
      <Input
        type="text"
        readOnly={readOnly}
        value={displayVal}
        placeholder={placeholder}
        className={`w-full ${className}`}
        onClick={() => {
          if (!readOnly && dateInputRef.current) {
            try {
              if (dateInputRef.current.showPicker) {
                dateInputRef.current.showPicker();
              } else {
                dateInputRef.current.focus();
              }
            } catch (_) {}
          }
        }}
      />
      {!readOnly && (
        <input
          ref={dateInputRef}
          type="date"
          value={value || ""}
          onChange={(e) => onChange && onChange(e.target.value)}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            opacity: 0,
            pointerEvents: "none",
            zIndex: -1,
          }}
        />
      )}
    </div>
  );
};

export const Button = React.forwardRef(({
  children,
  onClick,
  className = "",
  variant = "primary",
  size = "md",
  disabled = false,
  style: propStyle = {},
  ...props
}, ref) => {
  const baseClasses =
    "font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all";
  const variants = {
    primary: "bg-blue-600 text-white hover:bg-blue-500 focus:ring-blue-500",
    outline:
      "border border-gray-600 bg-gray-800 text-gray-100 hover:bg-gray-700 hover:border-gray-500 focus:ring-blue-500",
    destructive: "bg-red-700 text-white hover:bg-red-600 focus:ring-red-500",
    success: "bg-green-700 text-white hover:bg-green-600 focus:ring-green-500",
  };
  const sizes = {
    sm: "px-2 py-1 text-sm",
    md: "px-4 py-2",
    lg: "px-6 py-3 text-lg",
  };

  const computedStyle =
    variant === "destructive"
      ? { backgroundColor: "#dc2626", color: "#ffffff", border: "1px solid #b91c1c", fontWeight: "bold", ...propStyle }
      : propStyle;

  return (
    <button
      ref={ref}
      onClick={onClick}
      disabled={disabled}
      style={computedStyle}
      className={`${baseClasses} ${variants[variant]} ${sizes[size]} ${
        disabled ? "opacity-40 cursor-not-allowed" : ""
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
});

export const Label = ({ children, className = "" }) => (
  <label
    className={`block text-sm font-medium text-gray-700 mb-1 ${className}`}
  >
    {children}
  </label>
);

export const Textarea = ({ className = "", ...props }) => (
  <textarea
    className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-black ${className}`}
    {...props}
  />
);

// ================== Tab Components ==================

export const Tabs = ({ children, value, onValueChange }) => (
  <div className="w-full">
    {React.Children.map(
      children,
      (child) =>
        child &&
        React.cloneElement(child, {
          activeTab: value,
          onTabChange: onValueChange,
        }),
    )}
  </div>
);

export const TabsList = ({ children, activeTab, onTabChange }) => (
  <div
    className="flex"
    style={{
      display: "flex",
      gap: "0.25rem",
      background: "#111113",
      padding: "0.3rem",
      borderRadius: "0.75rem",
      marginBottom: "1rem",
      border: "1px solid #2a2a2e",
    }}
  >
    {React.Children.map(
      children,
      (child, index) =>
        child &&
        React.cloneElement(child, {
          isActive: child.props.value === activeTab,
          onClick: () => onTabChange && onTabChange(child.props.value),
        }),
    )}
  </div>
);

export const TabsTrigger = ({
  children,
  value,
  isActive,
  onClick,
  className = "",
}) => {
  const isPurge = value === "purge" || className.includes("red");
  const bg = isActive
    ? (isPurge ? "#dc2626" : "#1d4ed8")
    : "transparent";
  const textColor = isActive
    ? "#ffffff"
    : (isPurge ? "#ef4444" : "#9ca3af");
  const shadow = isActive
    ? (isPurge ? "0 2px 8px rgba(220,38,38,0.5)" : "0 2px 8px rgba(29,78,216,0.4)")
    : "none";

  return (
    <button
      onClick={onClick}
      style={{
        padding: "0.4rem 0.9rem",
        fontSize: "0.875rem",
        fontWeight: 600,
        borderRadius: "0.55rem",
        border: isPurge ? "1px solid rgba(220,38,38,0.4)" : "none",
        cursor: "pointer",
        transition: "all 0.18s ease",
        background: bg,
        color: textColor,
        boxShadow: shadow,
      }}
      className={className}
    >
      {children}
    </button>
  );
};

export const TabsContent = ({ children, value, activeTab }) =>
  activeTab === value ? <div>{children}</div> : null;

// ================== Loader ==================

export const Loader2 = ({ size = 16, className = "" }) => (
  <span
    className={`inline-block animate-spin ${className}`}
    style={{ fontSize: size }}
  >
    ↻
  </span>
);

