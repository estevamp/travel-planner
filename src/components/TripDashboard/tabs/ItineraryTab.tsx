import { motion } from "motion/react";

export function ItineraryTab(props: any) {
  return (
    <motion.div key="itinerary" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
      <p>Itinerary Tab - To be implemented</p>
    </motion.div>
  );
}
