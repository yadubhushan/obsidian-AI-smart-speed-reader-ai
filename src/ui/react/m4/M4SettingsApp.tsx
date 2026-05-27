import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, Check, RotateCcw, Save, Type, ChevronDown, Eye, Sliders, Sparkles, Zap, Layers } from "lucide-react";
import { PLAYBACK_MODE_ORDER, getPlaybackModeLabel } from "../../../engine/playbackMode";
import {
	DEFAULT_SETTINGS,
	READER_FONT_OPTIONS,
	type FocusStrategyId,
	type M4ThemePresetId,
	type PlaybackMode,
	type SpeedReaderAiSettings
} from "../../../types";
import { listFocusStrategies } from "../../readerShell/m4/focusStrategies/focusStrategyRegistry";
import { M4_THEME_PRESET_META } from "../../readerShell/m4/m4ThemePresets";

export interface M4SettingsAppProps {
	settings: SpeedReaderAiSettings;
	showGesturesGuide?: boolean;
	onSave: (settings: SpeedReaderAiSettings) => void;
	onDefaults: () => SpeedReaderAiSettings;
	onResetFontSize: () => void;
	onBack: () => void;
}

const GESTURE_ITEMS = [
	"Tap RSVP area to play or pause",
	"Double-tap left or right to skip",
	"Long-press word to look up definition",
	"Double-tap context word to define",
	"Swipe up or down while playing to adjust speed"
];

function collectDraft(
	draft: SpeedReaderAiSettings,
	selectedStrategy: FocusStrategyId,
	selectedPreset: M4ThemePresetId,
	form: HTMLFormElement
): SpeedReaderAiSettings {
	const fd = new FormData(form);
	const bool = (name: string) => fd.get(name) === "on";
	const num = (name: string) => Number(fd.get(name));
	const str = (name: string) => String(fd.get(name) ?? "");

	return {
		...draft,
		reader: {
			...draft.reader,
			font: str("font") as SpeedReaderAiSettings["reader"]["font"],
			contextLineFontSize: num("contextLineFontSize"),
			wpm: num("wpm"),
			chunkSize: num("chunkSize"),
			defaultPlaybackMode: str("defaultPlaybackMode") as PlaybackMode,
			progressiveRsvpMaxWordLength: num("progressiveRsvpMaxWordLength"),
			colorScheme: str("colorScheme") as SpeedReaderAiSettings["reader"]["colorScheme"],
			themePreset: selectedPreset,
			focusStrategy: selectedStrategy,
			enableMicropause: bool("enableMicropause"),
			micropauseIntensity: num("micropauseIntensity"),
			lineRepeatGapMs: num("lineRepeatGapMs")
		}
	};
}

function CheckRow({
	name,
	label,
	defaultChecked,
	children
}: {
	name: string;
	label: string;
	defaultChecked: boolean;
	children?: ReactNode;
}) {
	return (
		<div className="speed-reader-m4-check-row">
			<input type="checkbox" name={name} id={name} defaultChecked={defaultChecked} />
			<label htmlFor={name}>{label}</label>
			{children}
		</div>
	);
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="speed-reader-m4-settings-field">
			<label className="speed-reader-m4-settings-field__label">{label}</label>
			{children}
		</div>
	);
}

export function M4SettingsApp({
	settings,
	showGesturesGuide,
	onSave,
	onDefaults,
	onResetFontSize,
	onBack
}: M4SettingsAppProps) {
	const [draft, setDraft] = useState(() => structuredClone(settings));
	const [selectedStrategy, setSelectedStrategy] = useState<FocusStrategyId>(
		draft.reader.focusStrategy
	);
	const [selectedPreset, setSelectedPreset] = useState<M4ThemePresetId>(draft.reader.themePreset);
	const [formKey, setFormKey] = useState(0);

	useEffect(() => {
		setDraft(structuredClone(settings));
		setSelectedStrategy(settings.reader.focusStrategy);
		setSelectedPreset(settings.reader.themePreset);
		setFormKey((k) => k + 1);
	}, [settings]);

	const applyAndSave = useCallback(
		(form: HTMLFormElement) => {
			const next = collectDraft(draft, selectedStrategy, selectedPreset, form);
			setDraft(next);
			onSave(next);
		},
		[draft, onSave, selectedPreset, selectedStrategy]
	);

	const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		applyAndSave(e.currentTarget);
	};

	const handleDefaults = () => {
		const next = onDefaults();
		setDraft(structuredClone(next));
		setSelectedStrategy(next.reader.focusStrategy);
		setSelectedPreset(next.reader.themePreset);
		setFormKey((k) => k + 1);
	};

	const handleResetFontSize = () => {
		const next = structuredClone(draft);
		next.reader.fontSize = DEFAULT_SETTINGS.reader.fontSize;
		setDraft(next);
		onResetFontSize();
		setFormKey((k) => k + 1);
	};

	const r = draft.reader;

	return (
		<div className="speed-reader-m4-settings-view">
			<header className="speed-reader-m4-settings-view__header">
				<button
					type="button"
					className="speed-reader-m4-top-btn"
					aria-label="Back to reader"
					onClick={onBack}
				>
					<ArrowLeft className="speed-reader-m4-icon" aria-hidden />
				</button>
				<h2 className="speed-reader-m4-settings-view__title">Settings</h2>
				<button
					type="submit"
					form="speed-reader-m4-settings-form"
					className="speed-reader-m4-settings-view__save-exit"
					onClick={(e) => {
						e.preventDefault();
						const form = document.getElementById(
							"speed-reader-m4-settings-form"
						) as HTMLFormElement | null;
						if (form) {
							applyAndSave(form);
							onBack();
						}
					}}
				>
					<Save className="speed-reader-m4-icon" aria-hidden />
					<span>Save & exit</span>
				</button>
			</header>

			<form
				id="speed-reader-m4-settings-form"
				key={formKey}
				className="speed-reader-m4-settings-view__scroll"
				onSubmit={handleSave}
			>
				<div className="speed-reader-m4-settings-view__sync-notice">
					Settings automatically synchronized across active presentation formats.
				</div>

				{showGesturesGuide ? (
					<section className="speed-reader-m4-settings-section">
						<h3>Mobile gestures</h3>
						<ul className="speed-reader-m4-settings-list">
							{GESTURE_ITEMS.map((item) => (
								<li key={item}>{item}</li>
							))}
						</ul>
					</section>
				) : null}

				<section className="speed-reader-m4-settings-section">
					<div className="speed-reader-m4-settings-section__header">
						<Eye className="speed-reader-m4-icon speed-reader-m4-icon--purple" aria-hidden />
						<h3>Visual Cognitive Strategy</h3>
					</div>
					<div className="speed-reader-m4-strategy-list">
						{listFocusStrategies().map((strategy) => {
							const isSelected = strategy.id === selectedStrategy;
							// Map strategy ID to icon
							let IconComp = Sparkles;
							if (strategy.id === "peach-anchor") IconComp = Sparkles;
							else if (strategy.id === "forward-pull") IconComp = Zap;
							else if (strategy.id === "parafoveal") IconComp = Eye;
							else if (strategy.id === "multi-orp") IconComp = Sparkles;
							else if (strategy.id === "crowding-shield") IconComp = Layers;

							return (
								<button
									key={strategy.id}
									type="button"
									className={`speed-reader-m4-strategy-card${isSelected ? " is-active" : ""}`}
									onClick={() => setSelectedStrategy(strategy.id)}
								>
									<div className="speed-reader-m4-strategy-card__icon-wrap">
										<IconComp className="speed-reader-m4-icon" aria-hidden />
									</div>
									<div className="speed-reader-m4-strategy-card__content">
										<div className="speed-reader-m4-strategy-card__header">
											<span className="speed-reader-m4-strategy-card__name">{strategy.name}</span>
											{isSelected && (
												<span className="speed-reader-m4-strategy-card__badge speed-reader-m4-strategy-card__badge--active">ACTIVE</span>
											)}
											{!strategy.isLive && (
												<span className="speed-reader-m4-strategy-card__badge">Preview</span>
											)}
										</div>
										<p className="speed-reader-m4-strategy-card__desc">{strategy.description}</p>
									</div>
								</button>
							);
						})}
					</div>
				</section>

				<section className="speed-reader-m4-settings-section speed-reader-m4-settings-section--boxed">
					<div className="speed-reader-m4-settings-section__header">
						<Sliders className="speed-reader-m4-icon speed-reader-m4-icon--accent" aria-hidden />
						<h3>Theme Explorer</h3>
					</div>
					<div className="speed-reader-m4-theme-grid">
						{M4_THEME_PRESET_META.map((preset) => {
							const isSelected = preset.id === selectedPreset;
							return (
								<button
									key={preset.id}
									type="button"
									className={`speed-reader-m4-theme-card${isSelected ? " is-active" : ""}`}
									onClick={() => setSelectedPreset(preset.id)}
								>
									<div className="speed-reader-m4-theme-card__left">
										<span
											className="speed-reader-m4-theme-card__swatch"
											style={{ backgroundColor: preset.rawHex }}
										/>
										<span className="speed-reader-m4-theme-card__name">{preset.name}</span>
									</div>
									{isSelected && (
										<Check className="speed-reader-m4-icon speed-reader-m4-icon--accent" aria-hidden />
									)}
								</button>
							);
						})}
					</div>
				</section>

				<div className="speed-reader-m4-settings-form">
					<FormField label="Font">
						<select name="font" className="speed-reader-m4-input" defaultValue={r.font}>
							{READER_FONT_OPTIONS.map((font) => (
								<option key={font} value={font}>
									{font}
								</option>
							))}
						</select>
					</FormField>

					<FormField label="Context line font size (px)">
						<input
							name="contextLineFontSize"
							type="number"
							className="speed-reader-m4-input"
							min={12}
							max={32}
							defaultValue={r.contextLineFontSize}
						/>
					</FormField>

					<FormField label="Words per minute">
						<input
							name="wpm"
							type="number"
							className="speed-reader-m4-input"
							min={50}
							max={5000}
							defaultValue={r.wpm}
						/>
					</FormField>

					<FormField label="Words per chunk">
						<input
							name="chunkSize"
							type="number"
							className="speed-reader-m4-input"
							min={1}
							max={30}
							defaultValue={r.chunkSize}
						/>
					</FormField>

					<FormField label="Default playback mode">
						<select
							name="defaultPlaybackMode"
							className="speed-reader-m4-input"
							defaultValue={r.defaultPlaybackMode}
						>
							{PLAYBACK_MODE_ORDER.map((mode) => (
								<option key={mode} value={mode}>
									{getPlaybackModeLabel(mode)}
								</option>
							))}
						</select>
					</FormField>

					<FormField label="Progressive RSVP max word length">
						<input
							name="progressiveRsvpMaxWordLength"
							type="number"
							className="speed-reader-m4-input"
							min={1}
							max={10}
							defaultValue={r.progressiveRsvpMaxWordLength}
						/>
					</FormField>

					<FormField label="Color scheme">
						<select name="colorScheme" className="speed-reader-m4-input" defaultValue={r.colorScheme}>
							{(["dark", "light", "auto"] as const).map((scheme) => (
								<option key={scheme} value={scheme}>
									{scheme}
								</option>
							))}
						</select>
					</FormField>

					<details className="speed-reader-m4-accordion">
						<summary className="speed-reader-m4-accordion__summary">
							<span className="speed-reader-m4-accordion__title">Advanced settings</span>
							<ChevronDown className="speed-reader-m4-accordion__icon" aria-hidden />
						</summary>
						<div className="speed-reader-m4-accordion__content">
							<h3 className="speed-reader-m4-settings-form__heading">Pacing</h3>
							<CheckRow
								name="enableMicropause"
								label="Enable micropause"
								defaultChecked={r.enableMicropause}
							/>
							<FormField label="Micropause intensity (1–3)">
								<input
									name="micropauseIntensity"
									type="number"
									className="speed-reader-m4-input"
									min={1}
									max={3}
									step={0.1}
									defaultValue={r.micropauseIntensity}
								/>
							</FormField>
							<FormField label="Line repeat gap (ms)">
								<input
									name="lineRepeatGapMs"
									type="number"
									className="speed-reader-m4-input"
									min={100}
									max={3000}
									defaultValue={r.lineRepeatGapMs}
								/>
							</FormField>
						</div>
					</details>
				</div>

				<div className="speed-reader-m4-settings-actions">
					<button type="submit" className="speed-reader-m4-btn speed-reader-m4-btn--primary">
						<Save className="speed-reader-m4-icon" aria-hidden />
						<span>Save</span>
					</button>
					<button type="button" className="speed-reader-m4-btn" onClick={handleDefaults}>
						<RotateCcw className="speed-reader-m4-icon" aria-hidden />
						<span>Defaults</span>
					</button>
					<button type="button" className="speed-reader-m4-btn" onClick={handleResetFontSize}>
						<Type className="speed-reader-m4-icon" aria-hidden />
						<span>Reset size</span>
					</button>
				</div>
			</form>
		</div>
	);
}
