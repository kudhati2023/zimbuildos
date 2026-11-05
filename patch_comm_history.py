import re

with open("src/erp/sales_crm_pipeline.py", "r") as f:
    code = f.read()

old_method_pattern = r"    def get_communication_history\(\s+self,\s+customer_id_or_name: Optional\[str\] = None,\s+inquiry_or_deal_ref: Optional\[str\] = None,\s+limit: int = 50\s+\) -> List\[Dict\[str, Any\]\]:\s+\"\"\"Retrieves chronological client communication history\.\"\"\"\s+filtered = \[\]\s+for c in reversed\(self\.communications\):\s+if customer_id_or_name:\s+if \(customer_id_or_name\.lower\(\) not in c\.customer_id_or_name\.lower\(\)\):\s+continue\s+if inquiry_or_deal_ref:\s+if \(inquiry_or_deal_ref\.lower\(\) not in c\.inquiry_or_deal_ref\.lower\(\)\):\s+continue\s+filtered\.append\(c\.to_dict\(\)\)\s+if len\(filtered\) >= limit:\s+break\s+return filtered"

new_methods = """    def _update_comm_indexes(self):
        if not hasattr(self, '_comm_customer_idx'):
            self._comm_customer_idx = {}
            self._comm_deal_idx = {}
            self._indexed_comms_len = 0

        curr_len = len(self.communications)
        if self._indexed_comms_len < curr_len:
            for idx in range(self._indexed_comms_len, curr_len):
                rec = self.communications[idx]
                ckey = rec.customer_id_or_name.lower()
                dkey = rec.inquiry_or_deal_ref.lower()

                if ckey not in self._comm_customer_idx:
                    self._comm_customer_idx[ckey] = []
                self._comm_customer_idx[ckey].append((idx, rec))

                if dkey not in self._comm_deal_idx:
                    self._comm_deal_idx[dkey] = []
                self._comm_deal_idx[dkey].append((idx, rec))
            self._indexed_comms_len = curr_len

    def get_communication_history(
        self,
        customer_id_or_name: Optional[str] = None,
        inquiry_or_deal_ref: Optional[str] = None,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        \"\"\"Retrieves chronological client communication history.\"\"\"
        if not customer_id_or_name and not inquiry_or_deal_ref:
            filtered = []
            for c in reversed(self.communications):
                filtered.append(c.to_dict())
                if len(filtered) >= limit:
                    break
            return filtered

        self._update_comm_indexes()

        filtered = []
        if customer_id_or_name and not inquiry_or_deal_ref:
            term = customer_id_or_name.lower()
            matches = []
            for k, records in self._comm_customer_idx.items():
                if term in k:
                    matches.extend(records)

            # Sort by original index in reverse to maintain chronological order
            matches.sort(key=lambda x: x[0], reverse=True)
            for _, rec in matches:
                filtered.append(rec.to_dict())
                if len(filtered) >= limit:
                    break
            return filtered

        elif inquiry_or_deal_ref and not customer_id_or_name:
            term = inquiry_or_deal_ref.lower()
            matches = []
            for k, records in self._comm_deal_idx.items():
                if term in k:
                    matches.extend(records)

            matches.sort(key=lambda x: x[0], reverse=True)
            for _, rec in matches:
                filtered.append(rec.to_dict())
                if len(filtered) >= limit:
                    break
            return filtered

        term1 = customer_id_or_name.lower()
        term2 = inquiry_or_deal_ref.lower()

        matches = []
        for k, records in self._comm_customer_idx.items():
            if term1 in k:
                matches.extend(records)

        matches.sort(key=lambda x: x[0], reverse=True)
        for _, rec in matches:
            if term2 in rec.inquiry_or_deal_ref.lower():
                filtered.append(rec.to_dict())
                if len(filtered) >= limit:
                    break
        return filtered"""

code = re.sub(old_method_pattern, new_methods, code)

with open("src/erp/sales_crm_pipeline.py", "w") as f:
    f.write(code)
