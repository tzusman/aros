interface SettingsCardProps {
  title: string;
  children: React.ReactNode;
}

export function SettingsCard({ title, children }: SettingsCardProps) {
  return (
    <div className="bg-surface rounded-lg p-3.5">
      <h3 className="text-[11px] text-text-primary font-semibold mb-2.5">
        {title}
      </h3>
      <div className="text-[10px] text-text-secondary leading-relaxed">
        {children}
      </div>
    </div>
  );
}
