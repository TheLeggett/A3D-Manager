/**
 * SD Card Onboarding Component
 *
 * Guides users through connecting their SD card.
 * Displays as a modal overlay until an SD card is connected.
 */

import { useState, useEffect, useRef } from 'react';
import { useServices } from '../contexts/ServicesContext';
import { Button } from './ui/Button';
import { trackOnboardingStarted, trackOnboardingCompleted, trackSDCardConnected } from '../lib/analytics';
import './SDCardOnboarding.css';

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

  // Reset loaded state when src changes
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

const WELCOME_SEEN_KEY = 'a3d-welcome-seen';

// Check for reset query parameter and clear welcome state if present
function checkResetWelcomeState() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('resetWelcomeState') === '1') {
    localStorage.removeItem(WELCOME_SEEN_KEY);
    // Clean up the URL by removing the query parameter
    const url = new URL(window.location.href);
    url.searchParams.delete('resetWelcomeState');
    window.history.replaceState({}, '', url.toString());
  }
}

// Run once on module load
checkResetWelcomeState();

type ConnectionMethod = 'analogue-3d' | 'sd-reader' | null;
type OnboardingStep =
  | 'welcome'
  | 'choose-method'
  | 'analogue-setup-1'
  | 'analogue-setup-2'
  | 'sd-reader-select';

export function SDCardOnboarding() {
  const { selectSDCard } = useServices();
  const [step, setStep] = useState<OnboardingStep>(() => {
    // Show welcome screen only on first visit
    if (!localStorage.getItem(WELCOME_SEEN_KEY)) {
      return 'welcome';
    }
    return 'choose-method';
  });
  const [connectionMethod, setConnectionMethod] = useState<ConnectionMethod>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const hasTrackedStart = useRef(false);

  // Track onboarding started (once)
  useEffect(() => {
    if (!hasTrackedStart.current) {
      trackOnboardingStarted();
      hasTrackedStart.current = true;
    }
  }, []);

  const handleWelcomeContinue = () => {
    localStorage.setItem(WELCOME_SEEN_KEY, 'true');
    setStep('choose-method');
  };

  const handleSelectMethod = (method: ConnectionMethod) => {
    setConnectionMethod(method);
    setError(null);
    if (method === 'analogue-3d') {
      setStep('analogue-setup-1');
    } else {
      setStep('sd-reader-select');
    }
  };

  const handleSelectSDCard = async () => {
    setIsSelecting(true);
    setError(null);

    try {
      const selected = await selectSDCard();

      if (selected === null) {
        setIsSelecting(false);
        return;
      }

      if (!selected.isValid) {
        setError('This folder does not appear to be an Analogue 3D SD card. Please select the root folder of your SD card.');
        setIsSelecting(false);
        return;
      }

      // Success - track and component will unmount when isSDCardConnected becomes true
      const method = connectionMethod || 'sd-reader';
      trackSDCardConnected(method);
      trackOnboardingCompleted(method);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to select SD card';
      setError(message);
      setIsSelecting(false);
    }
  };

  const handleStartOver = () => {
    setStep('choose-method');
    setConnectionMethod(null);
    setError(null);
  };

  // Welcome screen (first visit only)
  if (step === 'welcome') {
    return (
      <div className="onboarding-overlay">
        <div className="onboarding-modal">
          <div className="onboarding-split">
            <div className="onboarding-image-side">
              <OnboardingImage
                src="/welcome.png"
                alt="Analogue 3D with controller and game cartridge"
                className="onboarding-image"
              />
            </div>

            <div className="onboarding-content-side welcome-content">
              <div className="welcome-animate welcome-animate-1">
                <h1 className="onboarding-title">Welcome to A3D Manager</h1>
                <p className="welcome-tagline">
                  The unofficial companion app for your Analogue 3D
                </p>
              </div>

              <div className="setup-instructions welcome-animate welcome-animate-2">
                <h3>What you can do</h3>
                <ul className="welcome-features">
                  <li><strong>Custom cartridge artwork</strong> — personalize your game library with custom labels</li>
                  <li><strong>Per-game settings</strong> — configure display, performance, and save data for each title</li>
                  <li><strong>Browser-based</strong> — works directly with your SD card from a browser, no software to install</li>
                </ul>
              </div>

              <div className="welcome-animate welcome-animate-3">
                <div className="onboarding-buttons">
                  <Button
                    variant="primary"
                    size="lg"
                    onClick={handleWelcomeContinue}
                  >
                    Get Started
                  </Button>
                </div>

                <p className="welcome-footer">
                  Not affiliated with Analogue, Inc.
                  <br />
                  An open source version is available on{' '}
                  <a href="https://github.com/TheLeggett/A3D-Manager" target="_blank" rel="noopener noreferrer">
                    GitHub
                  </a>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Choose connection method
  if (step === 'choose-method') {
    return (
      <div className="onboarding-overlay">
        <div className="onboarding-modal">
          <div className="onboarding-split">
            <div className="onboarding-image-side">
              <OnboardingImage
                src="/welcome.png"
                alt="Analogue 3D with controller and game cartridge"
                className="onboarding-image"
              />
            </div>

            <div className="onboarding-content-side">
              <h1 className="onboarding-title">Connect Your SD Card</h1>

              <div className="setup-instructions">
                <h3>Choose connection method</h3>
                <div className="connection-options">
                  <button
                    className="connection-card"
                    onClick={() => handleSelectMethod('analogue-3d')}
                  >
                    <div className="connection-card-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
                      </svg>
                    </div>
                    <h3 className="connection-card-title">Analogue 3D</h3>
                    <p className="connection-card-desc">Direct USB-C connection</p>
                  </button>

                  <button
                    className="connection-card"
                    onClick={() => handleSelectMethod('sd-reader')}
                  >
                    <div className="connection-card-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z" />
                      </svg>
                    </div>
                    <h3 className="connection-card-title">SD Card Reader</h3>
                    <p className="connection-card-desc">External card reader</p>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Analogue 3D - Physical Setup
  if (step === 'analogue-setup-1') {
    return (
      <div className="onboarding-overlay">
        <div className="onboarding-modal">
          <div className="onboarding-split">
            <div className="onboarding-image-side">
              <OnboardingImage
                src="/setup-1.png"
                alt="Connect Analogue 3D to computer via USB-C"
                className="onboarding-image"
              />
            </div>

            <div className="onboarding-content-side">
              <StepIndicator currentStep={1} totalSteps={2} />

              <h1 className="onboarding-title">Connect to Your Computer</h1>

              <div className="setup-instructions">
                <h3>Instructions</h3>
                <ol>
                  <li>Fully power off your Analogue 3D and disconnect all controllers and cables</li>
                  <li>Leave your SD Card in your Analogue 3D.</li>
                  <li>Connect Analogue 3D's power port to your computer using the included <strong>USB-C cable</strong> and wait 5 seconds</li>
                </ol>
              </div>

              <div className="onboarding-buttons">
                <Button
                  variant="primary"
                  size="lg"
                  onClick={() => setStep('analogue-setup-2')}
                >
                  Continue
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={() => handleSelectMethod('sd-reader')}
                >
                  Use SD Reader Instead
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Analogue 3D - Enter USB Mode
  if (step === 'analogue-setup-2') {
    return (
      <div className="onboarding-overlay">
        <div className="onboarding-modal">
          <div className="onboarding-split">
            <div className="onboarding-image-side">
              <div className="onboarding-image-wrapper">
                <OnboardingImage
                  src="/setup-2.png"
                  alt="Analogue 3D front view showing power and reset buttons"
                  className="onboarding-image"
                />
                <div className="led-indicator">
                  <div className="led-dot" />
                </div>
              </div>
            </div>

            <div className="onboarding-content-side">
              <StepIndicator currentStep={2} totalSteps={2} />

              <h1 className="onboarding-title">Enter USB Mode</h1>

              <div className="setup-instructions">
                <h3>Instructions</h3>
                <ol>
                  <li>Press and hold the <strong>reset button</strong> (button on the right)</li>
                  <li>While holding reset, press and hold the <strong>power switch</strong> on the left</li>
                  <li>Hold both until the <strong>Power LED turns green</strong>, then release</li>
                  <li>Click <strong>"Select SD Card"</strong> below and choose your Analogue 3D</li>
                </ol>
              </div>

              {error && (
                <div className="onboarding-error">
                  <p className="onboarding-error-text">{error}</p>
                </div>
              )}

              <div className="onboarding-buttons">
                <Button
                  variant="primary"
                  size="lg"
                  onClick={handleSelectSDCard}
                  loading={isSelecting}
                >
                  Select SD Card
                </Button>
                <button className="onboarding-link" onClick={handleStartOver}>
                  Start Over
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // SD Reader - Simple selection screen
  if (step === 'sd-reader-select') {
    return (
      <div className="onboarding-overlay">
        <div className="onboarding-modal">
          <div className="onboarding-split">
            <div className="onboarding-image-side onboarding-image-side--cover">
              <OnboardingImage
                src="/sd-card-instruction.png"
                alt="SD card being inserted into a card reader"
                className="onboarding-image"
              />
            </div>

            <div className="onboarding-content-side">
              <h1 className="onboarding-title">Select SD Card</h1>

              <div className="setup-instructions">
                <h3>Instructions</h3>
                <ol>
                  <li>Insert your Analogue 3D's SD card into your card reader</li>
                  <li>Click the button below to open the folder picker</li>
                  <li>Select your <strong>SD card's root folder</strong></li>
                </ol>
              </div>

              {error && (
                <div className="onboarding-error">
                  <p className="onboarding-error-text">{error}</p>
                </div>
              )}

              <div className="onboarding-buttons">
                <Button
                  variant="primary"
                  size="lg"
                  onClick={handleSelectSDCard}
                  loading={isSelecting}
                >
                  Select SD Card Folder
                </Button>
                <button className="onboarding-link" onClick={handleStartOver}>
                  Start Over
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Fallback (should not reach here)
  return null;
}

function StepIndicator({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) {
  return (
    <div className="step-indicator">
      {Array.from({ length: totalSteps }, (_, i) => {
        const stepNum = i + 1;
        let className = 'step-dot';
        if (stepNum < currentStep) {
          className += ' completed';
        } else if (stepNum === currentStep) {
          className += ' active';
        }
        return <div key={i} className={className} />;
      })}
    </div>
  );
}
