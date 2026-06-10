interface MobileSidebarBackdropProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function MobileSidebarBackdrop({ isOpen, onClose }: MobileSidebarBackdropProps) {
  if (!isOpen) return null;

  return (
    <div
      data-testid="mobile-sidebar-backdrop"
      onClick={onClose}
      className="lg:hidden fixed inset-0 bg-black/70 backdrop-blur-sm z-40 transition-opacity"
    />
  );
}
