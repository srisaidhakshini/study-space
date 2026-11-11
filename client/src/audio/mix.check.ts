/** Quick checks for the pure audio maths:  npx tsx client/src/audio/mix.check.ts */
import { DEFAULT_SETTINGS } from '../state/settings';
import { channelGain, FOCUS_DUCK, INDOOR_RAIN_GAIN, isTypingTarget, masterGain, planLoop, rainFilterHz, rainGain } from './mix';

let failures = 0;
function check(name: string, ok: boolean): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failures += 1;
}
const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-9;

const s = { ...DEFAULT_SETTINGS };
const rain = { weather: 'rain', intensity: 1 } as const;
const light = { weather: 'rain', intensity: 0 } as const;

check('master follows the volume', near(masterGain(s), s.master));
check('mute silences the master', masterGain({ ...s, muted: true }) === 0);
check('ambience channel uses its own volume', near(channelGain(s, 'ambience', false), s.ambience));
check('music channel uses its own volume', near(channelGain(s, 'music', false), s.music));
check('music is ducked by 40% while focusing', near(channelGain(s, 'music', true), s.music * (1 - FOCUS_DUCK)));
check('focus does not duck ambience', near(channelGain(s, 'ambience', true), s.ambience));

check('no rain gain when dry', rainGain(s, { weather: 'clear', intensity: 0 }, false) === 0);
check('no rain gain when cloudy', rainGain(s, { weather: 'cloudy', intensity: 1 }, false) === 0);
check('no rain gain when the rain setting is off', rainGain({ ...s, rain: false }, rain, false) === 0);
check('heavy rain is louder than light rain', rainGain(s, rain, false) > rainGain(s, light, false));
check('light rain is still audible', rainGain(s, light, false) > 0);
check('indoor rain is quieter by the indoor factor', near(rainGain(s, rain, true), rainGain(s, rain, false) * INDOOR_RAIN_GAIN));
check('rain follows the ambience volume', near(rainGain({ ...s, ambience: 0 }, rain, false), 0));
check('indoor filter is lower than outdoor', rainFilterHz(true) < rainFilterHz(false));

check('same loop is kept, never restarted', planLoop('amb_cafe', 'amb_cafe') === 'keep');
check('a different loop is swapped', planLoop('amb_town', 'amb_cafe') === 'swap');
check('a first loop starts', planLoop(null, 'amb_cafe') === 'start');
check('a place with no sound stops the old loop', planLoop('amb_cafe', undefined) === 'stop');
check('nothing to do with no sound either side', planLoop(null, undefined) === 'none');

check('inputs are typing targets', isTypingTarget('INPUT', false));
check('contenteditable is a typing target', isTypingTarget('DIV', true));
check('buttons are not typing targets', !isTypingTarget('BUTTON', false));

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll audio mix checks passed.');
