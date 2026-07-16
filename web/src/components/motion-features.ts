// Framer-motion feature bundle, loaded async by MotionProvider so the animation
// runtime stays out of the first-paint chunks. domMax (not domAnimation) because
// the chat list animates with layout="position".
import { domMax } from "framer-motion";

export default domMax;
