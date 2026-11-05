import re

with open('src/App.tsx', 'r') as f:
    content = f.read()

# Add comments explaining optimizations
gis_metrics_code = """  // ⚡ Bolt Performance Optimization:
  // Extracted inline array filtering of `filteredGISStands` into a memoized precalculation.
  // This avoids redundant O(N) evaluations to check mapped geometry on every render loop,
  // combining the metric generation into a single pass.
  const gisStandMetrics = useMemo(() => {
    let mapped = 0;
    let unmapped = 0;
    for (const s of filteredGISStands) {
      if (s.geometry) mapped++;
      else unmapped++;
    }
    return { mapped, unmapped };
  }, [filteredGISStands]);
"""

content = re.sub(
    r'(const gisStandMetrics = useMemo\(.*?\}\, \[filteredGISStands\]\);)',
    gis_metrics_code,
    content,
    flags=re.DOTALL
)

apps_and_stands_code = """  // ⚡ Bolt Performance Optimization:
  // Replaced multiple O(N) inline `.filter()` calls inside the render method with `useMemo` hooks.
  // This prevents expensive recalculation of filtered data subsets on each component update,
  // particularly helpful given potentially large datasets for properties and applications.
  const approvedApplications = useMemo(() => {
    return applications.filter(a => a.status === 'APPROVED');
  }, [applications]);

  const availableStands = useMemo(() => {
    return stands.filter(s => s.status === 'AVAILABLE');
  }, [stands]);
"""

content = re.sub(
    r'(const approvedApplications = useMemo\(.*?\n  \}, \[stands\]\);)',
    apps_and_stands_code,
    content,
    flags=re.DOTALL
)

crm_inq_code = """  // ⚡ Bolt Performance Optimization:
  // Replaced O(N) inline `.filter()` in CRM inquiries JSX rendering with a memoized version.
  const filteredCrmInquiries = useMemo(() => {
    return crmInquiries.filter(i => inquiryChannelFilter === 'ALL' || i.source_channel === inquiryChannelFilter);
  }, [crmInquiries, inquiryChannelFilter]);
"""

content = re.sub(
    r'(const filteredCrmInquiries = useMemo\(.*?\n  \}, \[crmInquiries, inquiryChannelFilter\]\);)',
    crm_inq_code,
    content,
    flags=re.DOTALL
)

with open('src/App.tsx', 'w') as f:
    f.write(content)
