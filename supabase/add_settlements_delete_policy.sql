DROP POLICY IF EXISTS "Users can delete settlements in their trips" ON settlements;

CREATE POLICY "Users can delete settlements in their trips"
  ON settlements FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM trip_members tm
      WHERE tm.trip_id = settlements.trip_id
      AND tm.user_id = auth.uid()
    )
  );
