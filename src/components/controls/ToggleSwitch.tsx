import './controls.css';

interface ToggleSwitchProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  onText?: string;
  offText?: string;
}

export function ToggleSwitch({ label, checked, onChange, onText = 'ON', offText = 'OFF' }: ToggleSwitchProps) {
  return (
    <div className="control-row">
      <span className="control-label">{label}</span>
      <div className="toggle-container">
        <span className={`toggle-text text-pixel ${checked ? 'on' : 'off'}`}>
          {checked ? onText : offText}
        </span>
        <button
          className={`toggle-switch ${checked ? 'on' : 'off'}`}
          onClick={() => onChange(!checked)}
          role="switch"
          aria-checked={checked}
          aria-label={`${label} toggle`}
        >
          <span className="toggle-thumb">
            {checked && <span className="toggle-thumb-dot" />}
          </span>
        </button>
      </div>
    </div>
  );
}
