// Phantom — Guided tour controller (driver.js)
// Author: Subash Karki

import { driver, type Config, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { createSignal } from 'solid-js';
import { setPref } from '@/core/signals/preferences';
import { activeTopTab, setActiveTopTab, type TopTab } from '@/core/signals/app';
import { TOUR_STEPS, type TourStep } from './steps';
import { injectTourStyles } from './styles';

injectTourStyles();

const [tourActive, setTourActive] = createSignal(false);
export { tourActive };

let driverInstance: Driver | null = null;

function ensureTab(tab: TopTab | undefined): Promise<void> {
  if (!tab || activeTopTab() === tab) return Promise.resolve();
  setActiveTopTab(tab);
  return new Promise((resolve) => setTimeout(resolve, 100));
}

const THEME: Config = {
  showProgress: true,
  animate: true,
  smoothScroll: true,
  allowClose: true,
  overlayColor: '#000',
  overlayOpacity: 0.75,
  stagePadding: 8,
  stageRadius: 8,
  popoverClass: 'phantom-tour-popover',
  nextBtnText: '[ Next → ]',
  prevBtnText: '[ ← Back ]',
  doneBtnText: '[ Complete ]',
  progressText: '{{current}} of {{total}}',
};

function buildSteps(steps: TourStep[]) {
  return steps.map((step, idx) => ({
    element: step.element,
    popover: {
      title: step.title,
      description: step.description,
      side: step.side,
      align: step.align,
      onNextClick: () => {
        const next = steps[idx + 1];
        ensureTab(next?.requiredTab).then(() => driverInstance?.moveNext());
      },
      onPrevClick: () => {
        const prev = steps[idx - 1];
        ensureTab(prev?.requiredTab).then(() => driverInstance?.movePrevious());
      },
    },
  }));
}

export function startTour(): void {
  if (driverInstance) {
    driverInstance.destroy();
    driverInstance = null;
  }

  const first = TOUR_STEPS[0];
  ensureTab(first?.requiredTab).then(() => {
    driverInstance = driver({
      ...THEME,
      steps: buildSteps(TOUR_STEPS),
      onDestroyed: () => {
        setTourActive(false);
        void setPref('tour_completed', new Date().toISOString());
        driverInstance = null;
      },
    });
    setTourActive(true);
    driverInstance.drive();
  });
}

export function skipTour(): void {
  if (driverInstance) {
    driverInstance.destroy();
    driverInstance = null;
  }
  setTourActive(false);
  void setPref('tour_completed', new Date().toISOString());
}
