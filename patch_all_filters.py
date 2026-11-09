import os

filepath = 'src/App.tsx'
with open(filepath, 'r') as f:
    content = f.read()

search_1 = """  const filteredGISStands = useMemo(() => {
    const q = standSearch.toLowerCase();
    return gisStands.filter(s => {
      const matchesSearch = s.stand_number.toLowerCase().includes(q) ||
                            (s.holder_name ?? '').toLowerCase().includes(q) ||
                            s.parcel_id.toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'ALL' || s.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [gisStands, standSearch, statusFilter]);

  // ⚡ Bolt Performance Optimization:"""

replace_1 = """  const filteredGISStands = useMemo(() => {
    const q = standSearch.toLowerCase();
    return gisStands.filter(s => {
      const matchesSearch = s.stand_number.toLowerCase().includes(q) ||
                            (s.holder_name ?? '').toLowerCase().includes(q) ||
                            s.parcel_id.toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'ALL' || s.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [gisStands, standSearch, statusFilter]);

  // ⚡ Bolt Performance Optimization:
  // Extracted multiple .filter().length and .some() checks into a single pass loop
  // using useMemo to prevent redundant O(N) recalculations on every render cycle.
  const gisStandsMetrics = useMemo<{ mapped: number; unmapped: number }>(() => {
    let mapped = 0;
    let unmapped = 0;
    for (const s of filteredGISStands) {
      if (s.geometry) mapped++;
      else unmapped++;
    }
    return { mapped, unmapped };
  }, [filteredGISStands]);

  // ⚡ Bolt Performance Optimization:"""

search_2 = """                      <span>
                        {activeDev ? activeDev.name : 'No development'} • {filteredGISStands.filter(s => s.geometry).length} mapped
                        {filteredGISStands.some(s => !s.geometry) && ` • ${filteredGISStands.filter(s => !s.geometry).length} without survey boundary (see Data Grid)`}
                      </span>"""

replace_2 = """                      <span>
                        {activeDev ? activeDev.name : 'No development'} • {gisStandsMetrics.mapped} mapped
                        {gisStandsMetrics.unmapped > 0 && ` • ${gisStandsMetrics.unmapped} without survey boundary (see Data Grid)`}
                      </span>"""

search_3 = """  const filteredPublicStands = useMemo(() => {
    const searchLow = (publicStandSearch || '').toLowerCase();
    return publicStands.filter(s => {
      if (publicSchemeFilter && s.scheme_name !== publicSchemeFilter) return false;
      if (searchLow && !s.stand_number.toLowerCase().includes(searchLow)) return false;
      return true;
    });
  }, [publicStands, publicSchemeFilter, publicStandSearch]);"""

replace_3 = """  const filteredPublicStands = useMemo(() => {
    const searchLow = (publicStandSearch || '').toLowerCase();
    return publicStands.filter(s => {
      if (publicSchemeFilter && s.scheme_name !== publicSchemeFilter) return false;
      if (searchLow && !s.stand_number.toLowerCase().includes(searchLow)) return false;
      return true;
    });
  }, [publicStands, publicSchemeFilter, publicStandSearch]);

  // ⚡ Bolt Performance Optimization:
  // Memoize the filtered lists of CRM inquiries, approved applications, and available stands.
  // This avoids inline `.filter()` calls on every render inside map operations and selects.
  const filteredCrmInquiries = useMemo(() => {
    return crmInquiries.filter(i => inquiryChannelFilter === 'ALL' || i.source_channel === inquiryChannelFilter);
  }, [crmInquiries, inquiryChannelFilter]);

  const approvedApplications = useMemo(() => {
    return applications.filter(a => a.status === 'APPROVED');
  }, [applications]);

  const availableStands = useMemo(() => {
    return stands.filter(s => s.status === 'AVAILABLE');
  }, [stands]);"""


search_4 = """                  <option value="">-- Choose Approved Applicant --</option>
                  {applications.filter(a => a.status === 'APPROVED').map(a => (
                    <option key={a.application_id} value={a.application_id}>"""

replace_4 = """                  <option value="">-- Choose Approved Applicant --</option>
                  {approvedApplications.map(a => (
                    <option key={a.application_id} value={a.application_id}>"""

search_5 = """                  <option value="">-- Choose Available Stand --</option>
                  {stands.filter(s => s.status === 'AVAILABLE').map(s => (
                    <option key={s.parcel_id} value={s.parcel_id}>"""

replace_5 = """                  <option value="">-- Choose Available Stand --</option>
                  {availableStands.map(s => (
                    <option key={s.parcel_id} value={s.parcel_id}>"""

search_6 = """                        <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                          {(crmInquiries.filter(i => inquiryChannelFilter === 'ALL' || i.source_channel === inquiryChannelFilter)).map(inq => (
                            <tr key={inq.inquiry_id} className="hover:bg-slate-800/40 transition">"""

replace_6 = """                        <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                          {filteredCrmInquiries.map(inq => (
                            <tr key={inq.inquiry_id} className="hover:bg-slate-800/40 transition">"""

if search_1 in content and search_2 in content and search_3 in content and search_4 in content and search_5 in content and search_6 in content:
    content = content.replace(search_1, replace_1, 1)
    content = content.replace(search_2, replace_2, 1)
    content = content.replace(search_3, replace_3, 1)
    content = content.replace(search_4, replace_4, 1)
    content = content.replace(search_5, replace_5, 1)
    content = content.replace(search_6, replace_6, 1)
    with open(filepath, 'w') as f:
        f.write(content)
    print("Patch applied successfully.")
else:
    print("Search blocks not found.")
    if search_1 not in content: print("1")
    if search_2 not in content: print("2")
    if search_3 not in content: print("3")
    if search_4 not in content: print("4")
    if search_5 not in content: print("5")
    if search_6 not in content: print("6")
