import { motion } from "motion/react";

export function PeopleTab(props: any) {
  return (
    <motion.div key="people" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
      <p>People Tab - To be implemented</p>
    </motion.div>
  );
}
