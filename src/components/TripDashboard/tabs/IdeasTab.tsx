import { motion } from "motion/react";

export function IdeasTab(props: any) {
  return (
    <motion.div key="ideas" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
      <p>Ideas Tab - To be implemented</p>
    </motion.div>
  );
}
