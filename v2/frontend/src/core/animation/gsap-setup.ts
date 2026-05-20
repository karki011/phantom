// Author: Subash Karki

import { gsap } from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { TextPlugin } from 'gsap/TextPlugin';
import { CustomEase } from 'gsap/CustomEase';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';

gsap.registerPlugin(SplitText, TextPlugin, CustomEase, ScrambleTextPlugin);

CustomEase.create('phantom-snap', 'M0,0 C0.32,0.72,0,1,1,1');
CustomEase.create('phantom-elastic', 'M0,0 C0.2,1.2,0.4,1,1,1');

export { gsap, SplitText, TextPlugin, CustomEase, ScrambleTextPlugin };
