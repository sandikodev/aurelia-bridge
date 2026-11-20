/** @jsxImportSource @builder.io/qwik */
import { component$, useSignal, useTask$, $, type PropFunction } from '@builder.io/qwik';

export interface QwikCounterProps {
  value?: number;
  onChange$?: PropFunction<(val: number) => void>;
  onCounterChange$?: PropFunction<(val: number) => void>;
  onChange?: (val: number) => void;
  onCounterChange?: (val: number) => void;
}

/**
 * Idiomatic Qwik Component (Official Community Best Practice)
 *
 * Demonstrates:
 * 1. Resumable Component: Standard `component$` function boundary.
 * 2. Fine-grained Reactivity: `useSignal()` for localized isolated state (`localStep`, `localClicks`, `sharedValue`).
 * 3. Lazy Event Listeners: Idiomatic `$(() => ...)` QRL closures passed to `onClick$`.
 * 4. Plain Props: Bi-directional synchronization using standard `useTask$` tracking without DOM querying.
 * 5. Resumable Meter: Pure signal-driven style reactivity.
 * 6. Bounded Context: Bi-directional sync with Aurelia host via typed `onChange$` / `onChange`.
 */
export const QwikCounter = component$<QwikCounterProps>((props) => {
  // 1. ISOLATED LOCAL STATE (Component-Scoped Qwik Signals)
  const localStep = useSignal(1);
  const localClicks = useSignal(0);
  const sharedValue = useSignal(props.value ?? 0);

  // Sync when props.value updates externally (e.g. Host Surge from Aurelia)
  useTask$(({ track }) => {
    track(() => props.value);
    if (props.value !== undefined) {
      sharedValue.value = props.value;
    }
  });

  const handleIncrement = $(() => {
    localClicks.value++;
    sharedValue.value += localStep.value;
    (props.onChange$ ?? props.onChange ?? props.onCounterChange)?.(sharedValue.value);
  });

  const handleDecrement = $(() => {
    localClicks.value++;
    sharedValue.value -= localStep.value;
    (props.onChange$ ?? props.onChange ?? props.onCounterChange)?.(sharedValue.value);
  });

  const handleStepToggle = $(() => {
    localStep.value = localStep.value === 1 ? 5 : localStep.value === 5 ? 10 : 1;
  });

  const handleReset = $(() => {
    localClicks.value++;
    sharedValue.value = 0;
    (props.onChange$ ?? props.onChange ?? props.onCounterChange)?.(0);
  });

  return (
    <div class="framework-card qwik-card">
      <div class="framework-header">
        <span class="framework-logo">⚡</span>
        <div>
          <strong class="qwik-title">Qwik Resumable Component</strong>
          <p class="framework-sub">Official component$(), useSignal() &amp; $(...) QRL Boundaries</p>
        </div>
      </div>

      {/* Scope Breakdown Badges */}
      <div class="scope-pills">
        <span class="pill pill-shared">Shared: {sharedValue.value}</span>
        <span class="pill pill-isolated">Isolated Clicks: {localClicks.value}</span>
        <span class="pill pill-step">Step: &plusmn;{localStep.value}</span>
      </div>

      {/* Local DOM Manipulation: Reactive Qwik Meter */}
      <div class="meter-wrapper">
        <div class="meter-label">
          <span>Qwik Resumable Meter:</span>
          <span>{Math.min(Math.max(sharedValue.value * 2, 5), 100)}%</span>
        </div>
        <div class="meter-track">
          <div
            class="meter-bar qwik-meter-bar"
            style={{
              width: `${Math.min(Math.max(sharedValue.value * 2, 5), 100)}%`,
              filter: `hue-rotate(${sharedValue.value * 16}deg)`,
            }}
          />
        </div>
      </div>

      {/* Controls: Canonical onClick$ closures */}
      <div class="framework-controls">
        <button
          type="button"
          class="btn-framework btn-qwik qwik-inc-btn"
          onClick$={handleIncrement}
        >
          +{localStep.value} Shared
        </button>
        <button
          type="button"
          class="btn-framework btn-sub qwik-dec-btn"
          onClick$={handleDecrement}
        >
          -{localStep.value}
        </button>
        <button
          type="button"
          class="btn-framework btn-isolated"
          onClick$={handleStepToggle}
          title="Toggles local step size exclusively inside Qwik without affecting Aurelia host"
        >
          Step: &plusmn;{localStep.value} (Local)
        </button>
        <button
          type="button"
          class="btn-framework btn-link-reset qwik-reset-btn"
          onClick$={handleReset}
        >
          Reset
        </button>
      </div>
    </div>
  );
});
