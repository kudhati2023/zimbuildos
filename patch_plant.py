import re

with open('src/components/construction/PlantPanel.tsx', 'r') as f:
    content = f.read()

search = """  const refresh = async () => { await Promise.all([reload(), reloadSummary()]); };
  const down = fleet.filter((e) => e.status !== 'AVAILABLE').length;
  const due = fleet.filter((e) => e.service_due).length;
  const machine = fleet.find((e) => e.equipment_id === selected) ?? null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Machines" value={fleet.length} hint={`${fleet.length - down} available`} />
        <Stat label="Out of use" value={down} tone={down ? 'amber' : 'green'} hint="In workshop or out of service" />
        <Stat label="Service overdue" value={due} tone={due ? 'red' : 'green'} hint={`${fleet.filter((e) => e.service_due_soon).length} due soon`} />
        <Stat label={`Downtime (${summary?.windowDays ?? 90} days)`} value={`${num(summary?.equipment.reduce((s, e) => s + e.downtime_hours, 0) ?? 0)} h`}
          hint={usd(summary?.equipment.reduce((s, e) => s + e.maintenance_cost_usd, 0) ?? 0) + ' maintenance spend'} />
      </div>"""

replace = """  const refresh = async () => { await Promise.all([reload(), reloadSummary()]); };

  const { down, due, dueSoon, downtime, maintenanceCost } = useMemo(() => {
    let downCount = 0, dueCount = 0, dueSoonCount = 0, totalDowntime = 0, totalMaintenanceCost = 0;
    for (let i = 0; i < fleet.length; i++) {
      const e = fleet[i];
      if (e.status !== 'AVAILABLE') downCount++;
      if (e.service_due) dueCount++;
      if (e.service_due_soon) dueSoonCount++;
    }
    if (summary?.equipment) {
      for (let i = 0; i < summary.equipment.length; i++) {
        const e = summary.equipment[i];
        totalDowntime += e.downtime_hours;
        totalMaintenanceCost += e.maintenance_cost_usd;
      }
    }
    return {
      down: downCount,
      due: dueCount,
      dueSoon: dueSoonCount,
      downtime: totalDowntime,
      maintenanceCost: totalMaintenanceCost
    };
  }, [fleet, summary?.equipment]);

  const machine = fleet.find((e) => e.equipment_id === selected) ?? null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Machines" value={fleet.length} hint={`${fleet.length - down} available`} />
        <Stat label="Out of use" value={down} tone={down ? 'amber' : 'green'} hint="In workshop or out of service" />
        <Stat label="Service overdue" value={due} tone={due ? 'red' : 'green'} hint={`${dueSoon} due soon`} />
        <Stat label={`Downtime (${summary?.windowDays ?? 90} days)`} value={`${num(downtime)} h`}
          hint={usd(maintenanceCost) + ' maintenance spend'} />
      </div>"""

new_content = content.replace(search, replace, 1)

import_search = "import { useState } from 'react';"
import_replace = "import { useState, useMemo } from 'react';"

new_content = new_content.replace(import_search, import_replace, 1)

with open('src/components/construction/PlantPanel.tsx', 'w') as f:
    f.write(new_content)
