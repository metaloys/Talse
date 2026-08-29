import type { SVGProps } from "react";
import type { CategoryId } from "@/lib/services/data";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 24, strokeWidth = 1.8, ...props }: IconProps & { strokeWidth?: number }) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...props,
  };
}

export function IconHome(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M9.5 21v-6h5v6" />
    </svg>
  );
}

export function IconGrid(p: IconProps) {
  return (
    <svg {...base(p)}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

export function IconSearch(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.2-3.2" />
    </svg>
  );
}

export function IconActivity(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M3 12h4l2.5 6.5L14 4l2.5 8H21" />
    </svg>
  );
}

export function IconUser(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-3.6 3.6-6 8-6s8 2.4 8 6" />
    </svg>
  );
}

export function IconPlus(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconMinus(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M5 12h14" />
    </svg>
  );
}

export function IconBack(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

export function IconClose(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function IconChevronRight(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="m9 5 7 7-7 7" />
    </svg>
  );
}

export function IconChevronDown(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function IconCheck(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M5 12.5 10 17l9-10" />
    </svg>
  );
}

export function IconCheckCircle(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </svg>
  );
}

export function IconEdit(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M4 20h4l10-10-4-4L4 16v4Z" />
      <path d="m13.5 6.5 4 4" />
    </svg>
  );
}

export function IconTrash(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

export function IconSliders(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M4 6h11M18 6h2M4 12h2M9 12h11M4 18h11M18 18h2" />
      <circle cx="16.5" cy="6" r="2" />
      <circle cx="7.5" cy="12" r="2" />
      <circle cx="16.5" cy="18" r="2" />
    </svg>
  );
}

export function IconClock(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function IconPin(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

export function IconCalendar(p: IconProps) {
  return (
    <svg {...base(p)}>
      <rect x="3.5" y="5" width="17" height="16" rx="2" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
    </svg>
  );
}

export function IconTag(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M3 12.5V4h8.5L21 13.5 13.5 21 3 12.5Z" />
      <circle cx="7.5" cy="8" r="1.4" />
    </svg>
  );
}

export function IconWallet(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M4 7.5h15a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12" />
      <path d="M16 13h5" />
      <circle cx="16" cy="13" r=".8" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconInbox(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M4 13l2.5-8h11L20 13" />
      <path d="M4 13v6h16v-6h-5a3 3 0 0 1-6 0H4Z" />
    </svg>
  );
}

export function IconPaperclip(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="m14.5 6.5-6.8 6.8a3.2 3.2 0 0 0 4.5 4.5l7-7a4.8 4.8 0 0 0-6.8-6.8l-7.1 7.1a6.3 6.3 0 0 0 8.9 8.9l6-6" />
    </svg>
  );
}

export function IconSend(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M4 12 20 4l-6 16-3-7-7-1Z" />
    </svg>
  );
}

export function IconImage(p: IconProps) {
  return (
    <svg {...base(p)}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="9" cy="9.5" r="1.6" />
      <path d="m4 17 5-5 4 4 3-3 4 4" />
    </svg>
  );
}

export function IconSparkle(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 3.5c.6 3.8 1.7 4.9 5.5 5.5-3.8.6-4.9 1.7-5.5 5.5-.6-3.8-1.7-4.9-5.5-5.5 3.8-.6 4.9-1.7 5.5-5.5Z" />
      <path d="M18.5 15c.3 1.8.8 2.3 2.5 2.6-1.7.3-2.2.8-2.5 2.6-.3-1.8-.8-2.3-2.5-2.6 1.7-.3 2.2-.8 2.5-2.6Z" />
    </svg>
  );
}

export function IconSpinner(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  );
}

export function IconFlag(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M6 21V4" />
      <path d="M6 4h11l-2 3.5L17 11H6" />
    </svg>
  );
}

export function IconShield(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 3 5 6v5c0 4.4 3 8.3 7 10 4-1.7 7-5.6 7-10V6l-7-3Z" />
    </svg>
  );
}

export function IconArrowRight(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function IconLogo(p: IconProps) {
  return (
    <svg {...base({ ...p, strokeWidth: 1.6 })}>
      <path d="M6 4h7a5 5 0 0 1 0 10H9v6" />
      <path d="M8.5 8.5h9" />
    </svg>
  );
}

// ---- category dispatcher ----
function IconPalette(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.9 1.8-1.9 0-1 .8-1.6 1.7-1.6H17a4 4 0 0 0 4-4c0-5-4-9.5-9-9.5Z" />
      <circle cx="7.5" cy="11" r="1" />
      <circle cx="10" cy="7.5" r="1" />
      <circle cx="14.5" cy="7.5" r="1" />
    </svg>
  );
}

function IconCode(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="m9 8-4 4 4 4M15 8l4 4-4 4M13 6l-2 12" />
    </svg>
  );
}

function IconMegaphone(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M4 10v4l10 4V6L4 10Z" />
      <path d="M14 7.5c2.5.5 4 2 4 4.5s-1.5 4-4 4.5" />
      <path d="M6 14.5V19h3l-1-4" />
    </svg>
  );
}

function IconBriefcase(p: IconProps) {
  return (
    <svg {...base(p)}>
      <rect x="3.5" y="7" width="17" height="12" rx="2" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
      <path d="M3.5 12h17" />
    </svg>
  );
}

function IconBook(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M5 4h9a2 2 0 0 1 2 2v14H7a2 2 0 0 0-2 2V4Z" />
      <path d="M16 6h3v14h-3" />
    </svg>
  );
}

function IconBroom(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M15 4 9 10" />
      <path d="M13 8l4 4" />
      <path d="M9 10c-2 2-3 4-3 7h9c0-3-1-5-3-7l-3 0Z" />
    </svg>
  );
}

function IconDots(p: IconProps) {
  return (
    <svg {...base(p)}>
      <circle cx="6" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="18" cy="12" r="1.6" />
    </svg>
  );
}

export function CategoryIcon({ id, ...p }: IconProps & { id: CategoryId }) {
  switch (id) {
    case "design":
      return <IconPalette {...p} />;
    case "development":
      return <IconCode {...p} />;
    case "marketing":
      return <IconMegaphone {...p} />;
    case "business":
      return <IconBriefcase {...p} />;
    case "education":
      return <IconBook {...p} />;
    case "home":
      return <IconBroom {...p} />;
    default:
      return <IconDots {...p} />;
  }
}
