/**
 * Data Safety Modal
 *
 * Displays after SD card connection to remind users about data persistence
 * and how to protect their data. Shows once per browser session.
 */

import { useState, useEffect } from 'react';
import { Button } from './ui/Button';
import './SDCardOnboarding.css';

const SESSION_KEY = 'a3d-data-safety-acknowledged';

// Image component that waits for load before animating
function OnboardingImage({
  src,
  alt,
  className = ''
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
  }, [src]);

  return (
    <img
      src={src}
      alt={alt}
      className={`${className} ${loaded ? 'loaded' : ''}`}
      onLoad={() => setLoaded(true)}
    />
  );
}

interface DataSafetyModalProps {
  onAcknowledge: () => void;
}

export function DataSafetyModal({ onAcknowledge }: DataSafetyModalProps) {
  const handleContinue = () => {
    sessionStorage.setItem(SESSION_KEY, 'true');
    onAcknowledge();
  };

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-modal">
        <div className="onboarding-split">
          <div className="onboarding-image-side">
            <OnboardingImage
              src="/danger-onboarding.png"
              alt="Data safety reminder"
              className="onboarding-image"
            />
          </div>

          <div className="onboarding-content-side">
            <h1 className="onboarding-title">Before You Begin</h1>

            <div className="setup-instructions">
              <h3>How Your Data is Stored</h3>
              <p className="data-safety-text">
                Your labels, settings, and saves are stored <strong>in this browser only</strong>.
                This data is not backed up to the cloud and can be lost if you clear your
                browser data or switch to a different browser.
              </p>
            </div>

            <div className="setup-instructions">
              <h3>Protect Your Data</h3>
              <ul className="welcome-features">
                <li>
                  <strong>Export backups regularly</strong> — Go to Settings → Export Bundle
                  to save a backup file to your computer
                </li>
                <li>
                  <strong>Sync to your SD card</strong> — Labels synced to your SD card
                  serve as a backup you can re-import later
                </li>
                <li>
                  <strong>Don't clear browser data</strong> — Clearing cookies or site data
                  will delete everything stored here
                </li>
              </ul>
            </div>

            <div className="onboarding-buttons">
              <Button
                variant="primary"
                size="lg"
                onClick={handleContinue}
              >
                I Understand
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Hook to manage data safety modal state
export function useDataSafetyModal() {
  const [acknowledged, setAcknowledged] = useState(() => {
    return sessionStorage.getItem(SESSION_KEY) === 'true';
  });

  const acknowledge = () => {
    setAcknowledged(true);
  };

  return {
    showModal: !acknowledged,
    acknowledge,
  };
}
