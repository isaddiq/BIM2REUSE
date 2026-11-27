/**
 * Inline stroke icons (24px grid, 1.75 stroke) that inherit currentColor,
 * so they follow the theme and the state of the control they sit in.
 */

const ICON_PATHS = {
  Upload: <><path d="M12 15V4" /><path d="m7 9 5-5 5 5" /><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></>,
  Download: <><path d="M12 4v11" /><path d="m7 10 5 5 5-5" /><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></>,
  Cube: <><path d="M12 3 20 7.5v9L12 21l-8-4.5v-9Z" /><path d="m4 7.5 8 4.5 8-4.5" /><path d="M12 12v9" /></>,
  Home: <><path d="M4 11 12 4l8 7" /><path d="M6 9.5V20h12V9.5" /></>,
  Search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>,
  Sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" /></>,
  Moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />,
  ChevronDown: <path d="m6 9 6 6 6-6" />,
  ChevronRight: <path d="m9 6 6 6-6 6" />,
  Eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></>,
  EyeOff: <><path d="M10.6 5.6A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16.5 16.5 0 0 1-2.6 3.4" /><path d="M6.6 6.6C3.9 8.3 2.5 12 2.5 12s3.5 6.5 9.5 6.5a9 9 0 0 0 5.4-1.6" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /><path d="m3 3 18 18" /></>,
  Isolate: <><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><rect x="8.5" y="8.5" width="7" height="7" rx="1" /></>,
  Focus: <><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>,
  Copy: <><rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2" /><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5" /></>,
  Layers: <><path d="m12 3 9 5-9 5-9-5Z" /><path d="m3 12.5 9 5 9-5" /><path d="m3 17 9 5 9-5" /></>,
  Tree: <><rect x="3" y="3.5" width="6" height="5" rx="1" /><rect x="14" y="10" width="7" height="4.5" rx="1" /><rect x="14" y="17" width="7" height="4.5" rx="1" /><path d="M6 8.5v10.7h8M6 12.2h8" /></>,
  Classes: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><circle cx="17" cy="17" r="3.5" /></>,
  Bookmark: <path d="M6.5 3.5h11v17L12 16l-5.5 4.5Z" />,
  Sets: <><circle cx="9" cy="10" r="5.5" /><circle cx="15" cy="14" r="5.5" /></>,
  Schema: <><circle cx="12" cy="5" r="2.2" /><circle cx="5" cy="19" r="2.2" /><circle cx="19" cy="19" r="2.2" /><path d="M12 7.2v4.3M12 11.5 6.3 17M12 11.5l5.7 5.5" /></>,
  Section: <><path d="M12 3 20 7.5v9L12 21l-8-4.5v-9Z" strokeDasharray="2.5 2.5" /><path d="M3 12.5h18" /><path d="m4 12.5 8 4.5 8-4.5" /></>,
  PlanCut: <><path d="M3 9.5 12 5l9 4.5-9 4.5Z" /><path d="M3 14.5 12 19l9-4.5" strokeDasharray="2.2 2.2" /><path d="M1.5 12h3M19.5 12h3" /></>,
  Ruler: <><path d="M3.5 16.5 16.5 3.5l4 4-13 13Z" /><path d="m7 13 1.8 1.8M10 10l1.8 1.8M13 7l1.8 1.8" /></>,
  Pin: <><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.3" /></>,
  X: <path d="M6 6l12 12M18 6 6 18" />,
  Refresh: <><path d="M20 11a8 8 0 0 0-14.6-4.5L4 8" /><path d="M4 3.5V8h4.5" /><path d="M4 13a8 8 0 0 0 14.6 4.5L20 16" /><path d="M20 20.5V16h-4.5" /></>,
  Camera: <><path d="M4 8h3.2L9 5.5h6L16.8 8H20a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" /><circle cx="12" cy="13.5" r="3.6" /></>,
  Shaded: <><path d="M12 3 20 7.5v9L12 21l-8-4.5v-9Z" /><path d="M12 12 20 7.5V16.5L12 21Z" fill="currentColor" fillOpacity="0.35" stroke="none" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" /></>,
  Xray: <><path d="M12 3 20 7.5v9L12 21l-8-4.5v-9Z" strokeOpacity="0.45" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" strokeOpacity="0.45" /><circle cx="12" cy="12" r="3" /></>,
  Wireframe: <><path d="M12 3 20 7.5v9L12 21l-8-4.5v-9Z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9M4 16.5l8-4.5 8 4.5M12 3v9" strokeOpacity="0.55" /></>,
  Edges: <><rect x="4" y="4" width="16" height="16" rx="1" /><path d="M4 4l16 16" strokeDasharray="2 2.5" /></>,
  Help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.3a2.6 2.6 0 0 1 5 .9c0 1.7-2.5 2.3-2.5 4" /><circle cx="12" cy="17.2" r="0.6" fill="currentColor" /></>,
  Plus: <path d="M12 5v14M5 12h14" />,
  Minus: <path d="M5 12h14" />,
  Check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  Alert: <><path d="M12 3.5 21.5 20h-19Z" /><path d="M12 10v4.5" /><circle cx="12" cy="17.3" r="0.6" fill="currentColor" /></>,
  Info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5" /><circle cx="12" cy="7.8" r="0.6" fill="currentColor" /></>,
  Filter: <path d="M4 5h16l-6.2 7.5V19l-3.6 1.5v-8Z" />,
  Table: <><rect x="3.5" y="4.5" width="17" height="15" rx="1.5" /><path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10" /></>,
  Log: <><path d="M6 3.5h9l4 4v13H6Z" /><path d="M15 3.5v4h4M9 12h7M9 15.5h7M9 8.5h3" /></>,
  Speed: <><path d="M4.5 17a8 8 0 1 1 15 0" /><path d="m12 13 3.5-4" /><circle cx="12" cy="13.5" r="1.2" /></>,
  Axes: <><path d="M5 19V5M5 19h14" /><path d="m5 19 7-7" /><path d="m3 7 2-2 2 2M17 17l2 2-2 2" /></>,
  Globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.7 3.6 5.7 3.6 9s-1.1 6.3-3.6 9c-2.5-2.7-3.6-5.7-3.6-9S9.5 5.7 12 3Z" /></>,
  Material: <><rect x="3.5" y="5" width="17" height="4" rx="1" /><rect x="3.5" y="10" width="17" height="4" rx="1" /><rect x="3.5" y="15" width="17" height="4" rx="1" /></>,
  Relationship: <><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><circle cx="18" cy="6" r="2.5" /><path d="M8.5 6h7M6 8.5v5a4.5 4.5 0 0 0 4.5 4.5h5" /></>,
  Code: <><path d="m8 7-5 5 5 5M16 7l5 5-5 5" /><path d="m13.5 4.5-3 15" /></>,
  Paint: <><circle cx="12" cy="12" r="9" /><circle cx="8" cy="10" r="1.3" fill="currentColor" /><circle cx="12" cy="7.5" r="1.3" fill="currentColor" /><circle cx="16" cy="10" r="1.3" fill="currentColor" /><path d="M12 21a3 3 0 0 1 0-6h2" /></>,
  Reset: <><path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5" /><path d="M4 4v4.5h4.5" /></>,
  Graph: <><circle cx="5" cy="12" r="2.3" /><circle cx="12" cy="5" r="2.3" /><circle cx="19" cy="12" r="2.3" /><circle cx="12" cy="19" r="2.3" /><path d="M6.7 10.4l3.6-3.8M13.7 6.6l3.6 3.8M17.3 13.6l-3.6 3.8M10.3 17.4l-3.6-3.8" /></>,
  Building: <><path d="M4 21V5.5L12 3v18M12 8h8v13M2.5 21h19" /><path d="M7 8h2M7 11.5h2M7 15h2M15 11.5h2M15 15h2" /></>,
  Door: <><path d="M5 21V4.5a1 1 0 0 1 1-1h9v17.5" /><path d="M15 4.5 19 6v15" /><circle cx="12" cy="12.5" r="0.7" fill="currentColor" /><path d="M3 21h18" /></>,
  Stairs: <path d="M3 20h5v-4.5h4.5V11H17V6.5h4" />,
  Play: <path d="M7 4.5v15l12.5-7.5Z" />,
  Ban: <><circle cx="12" cy="12" r="8.5" /><path d="m6 6 12 12" /></>,
  Dashboard: <><rect x="3.5" y="3.5" width="7" height="9" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="5" rx="1.5" /><rect x="13.5" y="11.5" width="7" height="9" rx="1.5" /><rect x="3.5" y="15.5" width="7" height="5" rx="1.5" /></>,
  More: <><circle cx="5.5" cy="12" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /><circle cx="18.5" cy="12" r="1.3" fill="currentColor" /></>,
  External: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>,
  Github: <path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" />,
  Activity: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  Grip: <><circle cx="9" cy="6" r="1" fill="currentColor" /><circle cx="15" cy="6" r="1" fill="currentColor" /><circle cx="9" cy="12" r="1" fill="currentColor" /><circle cx="15" cy="12" r="1" fill="currentColor" /><circle cx="9" cy="18" r="1" fill="currentColor" /><circle cx="15" cy="18" r="1" fill="currentColor" /></>,
  Swap: <><path d="M7 4 3.5 7.5 7 11" /><path d="M3.5 7.5H17" /><path d="m17 13 3.5 3.5L17 20" /><path d="M20.5 16.5H7" /></>,
  Columns: <><rect x="3" y="4.5" width="18" height="15" rx="2" /><path d="M12 4.5v15" /><path d="M5.8 13.5 7.7 11l1.9 2.5M14.5 9h4M14.5 12h4M14.5 15h2.5" /></>,
  Plan: <><rect x="3.5" y="3.5" width="17" height="17" rx="1.5" /><path d="M3.5 11h7v9.5M10.5 3.5V8M14 11h6.5M14 15v5.5" /></>,
  Space: <><path d="M3.5 8 12 4l8.5 4v8L12 20l-8.5-4Z" strokeDasharray="2.4 2" /><circle cx="12" cy="12" r="2" /></>,
  // Circular construction modules and project actions
  Cycle: <><path d="M20 11.5A8 8 0 0 0 6.2 6.4L4 8.5" /><path d="M4 4v4.5h4.5" /><path d="M4 12.5a8 8 0 0 0 13.8 5.1L20 15.5" /><path d="M20 20v-4.5h-4.5" /></>,
  Passport: <><rect x="4.5" y="3" width="15" height="18" rx="2" /><circle cx="12" cy="10" r="3" /><path d="M8.5 16.5h7" /></>,
  Assessment: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1" /><path d="m8.8 12.3 2 2 4.4-4.4" /><path d="M9 17.5h6" /></>,
  Deconstruct: <><rect x="3.5" y="15" width="17" height="5" rx="1" /><rect x="6" y="9" width="12" height="4.5" rx="1" strokeDasharray="2.2 2" /><path d="M12 7.5V3M9.5 5.5 12 3l2.5 2.5" /></>,
  Bank: <><path d="M3.5 9.5 12 4l8.5 5.5" /><path d="M5 9.5V19M9.7 9.5V19M14.3 9.5V19M19 9.5V19" /><path d="M3 20.5h18" /></>,
  Match: <><rect x="2.5" y="5" width="6" height="14" rx="1.2" /><rect x="15.5" y="5" width="6" height="14" rx="1.2" /><path d="M8.5 9h7M13 6.5 15.5 9 13 11.5M15.5 15h-7M11 12.5 8.5 15l2.5 2.5" /></>,
  Leaf: <><path d="M5 19c-.5-7.5 4-13.5 14.5-14.5C19.5 14 14 19 6.5 18.8" /><path d="M5 19c2.5-4.5 5.5-7.5 9.5-9.5" /></>,
  Report: <><path d="M6.5 3.5h8l4 4v12a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1Z" /><path d="M14.5 3.5v4h4" /><path d="M8.5 17v-3M12 17v-5.5M15.5 17v-2" /></>,
  Settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" /><circle cx="12" cy="12" r="6.6" /></>,
  Save: <><path d="M5 3.5h11.5L20.5 7.5v12a1 1 0 0 1-1 1h-14a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1Z" /><path d="M8 3.5V8h7.5V3.5" /><rect x="7.5" y="13" width="9" height="7.5" rx="0.5" /></>,
  FolderOpen: <><path d="M3.5 19V6a1 1 0 0 1 1-1h5l2 2.5h7a1 1 0 0 1 1 1V10" /><path d="M3.5 19 6.3 11.4a1 1 0 0 1 .9-.7h13.3a.8.8 0 0 1 .8 1L18.6 19a1 1 0 0 1-1 .7H4.3a.8.8 0 0 1-.8-.7Z" /></>,
  FilePlus: <><path d="M6.5 3.5h8l4 4v12a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1Z" /><path d="M14.5 3.5v4h4" /><path d="M12 11v6M9 14h6" /></>,
  PanelLeft: <><rect x="3.5" y="4" width="17" height="16" rx="2" /><path d="M9.5 4v16" /></>,
  Clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  Trash: <><path d="M4 6.5h16M9.5 6.5V4h5v2.5" /><path d="M6 6.5 7 20h10l1-13.5" /><path d="M10 10.5v6M14 10.5v6" /></>,
  Package: <><path d="M12 3 20 7.5v9L12 21l-8-4.5v-9Z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" /><path d="m8 5.3 8 4.4" /></>,
};

const IconSvg = (paths) => function Icon({ size = 16, className = '', style, title, ...rest } = {}) {
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
      focusable="false"
      style={style}
      {...rest}
    >
      {title && <title>{title}</title>}
      {paths}
    </svg>
  );
};

const Icons = {};
Object.keys(ICON_PATHS).forEach((name) => { Icons[name] = IconSvg(ICON_PATHS[name]); });
// Aliases kept for readability at call sites.
Object.assign(Icons, {
  Export: Icons.Download,
  Layer: Icons.Layers,
  Box: Icons.Cube,
  Edge: Icons.Edges,
  Move: Icons.Axes,
  PaintBucket: Icons.Paint,
  Pset: Icons.Table,
});

window.Icons = Icons;
