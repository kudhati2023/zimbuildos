#!/usr/bin/env python3
"""
Adds Tabs 20-23 to build_full_enterprise_erp.py:
20. Gantt Project Schedule & Critical Path Method (CPM)
21. Quality QA/QC, Concrete Cube Lab Testing & Digital Snag List
22. Dual-Currency Mortgage & Installment Financing Simulator
23. Municipal Building Permits & 6-Stage Statutory Inspections (Habitation Certificate)
"""

import sys

def main():
    file_path = "build_full_enterprise_erp.py"
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Add Navigation Tabs
    tabs_target = '''    <button onclick="showFunction('sysadmin')" id="tab-sysadmin" class="func-tab px-3 py-1 rounded-md text-slate-300 hover:text-white transition flex items-center gap-1.5 shrink-0" data-roles="ceo,sysadmin">
      <i class="fa-solid fa-shield-halved text-red-400"></i> 19. Zero-Trust Security
    </button>
  </nav>'''

    new_tabs = '''    <button onclick="showFunction('sysadmin')" id="tab-sysadmin" class="func-tab px-3 py-1 rounded-md text-slate-300 hover:text-white transition flex items-center gap-1.5 shrink-0" data-roles="ceo,sysadmin">
      <i class="fa-solid fa-shield-halved text-red-400"></i> 19. Zero-Trust Security
    </button>
    <!-- MODULE 20: Project Schedule & Critical Path -->
    <button onclick="showFunction('schedule')" id="tab-schedule" class="func-tab px-3 py-1 rounded-md text-slate-300 hover:text-white transition flex items-center gap-1.5 shrink-0" data-roles="ceo,qs,builder,siteops">
      <i class="fa-solid fa-diagram-project text-blue-400"></i> 20. Gantt Schedule & CPM
    </button>
    <!-- MODULE 21: Quality QA/QC, Concrete Cubes & Snags -->
    <button onclick="showFunction('quality')" id="tab-quality" class="func-tab px-3 py-1 rounded-md text-slate-300 hover:text-white transition flex items-center gap-1.5 shrink-0" data-roles="ceo,builder,qs,siteops">
      <i class="fa-solid fa-vial-circle-check text-emerald-400"></i> 21. QA/QC, Cubes & Snags
    </button>
    <!-- MODULE 22: Mortgage & Installment Simulator -->
    <button onclick="showFunction('mortgage')" id="tab-mortgage" class="func-tab px-3 py-1 rounded-md text-slate-300 hover:text-white transition flex items-center gap-1.5 shrink-0" data-roles="ceo,sales,fintax,buyer">
      <i class="fa-solid fa-coins text-amber-400"></i> 22. Mortgage & Financing
    </button>
    <!-- MODULE 23: Municipal Building Permits -->
    <button onclick="showFunction('permits')" id="tab-permits" class="func-tab px-3 py-1 rounded-md text-slate-300 hover:text-white transition flex items-center gap-1.5 shrink-0" data-roles="ceo,planner,builder,dlap">
      <i class="fa-solid fa-building-circle-check text-purple-400"></i> 23. Municipal Permits
    </button>
  </nav>'''

    if "tab-schedule" not in content:
        content = content.replace(tabs_target, new_tabs, 1)

    # 2. Add Content Panes for Modules 20, 21, 22, 23
    panes_target = "  </div>\n\n  <!-- ================================================================= -->\n  <!-- MODALS -->"
    new_panes = """
    <!-- ------------------------------------------------------------- -->
    <!-- FUNCTION 20: GANTT PROJECT SCHEDULE & CRITICAL PATH METHOD -->
    <!-- ------------------------------------------------------------- -->
    <div id="fn-schedule" class="fn-pane hidden h-full p-8 overflow-y-auto max-w-7xl mx-auto w-full space-y-6">
      <div class="border-b border-slate-800 pb-3 flex justify-between items-center">
        <div>
          <span class="text-xs uppercase font-bold text-blue-400 tracking-wider">Project Engineering & Site Milestones</span>
          <h2 class="text-2xl font-bold text-white mt-0.5">Critical Path Method (CPM) & Interactive Gantt Schedule</h2>
          <p class="text-xs text-slate-400">Dependency-linked construction sequence from Cadastral Pegging through Earthworks, Reticulation to Turnkey Handover.</p>
        </div>
        <div class="flex gap-2">
          <button onclick="openModal('modal-update-task')" class="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-bold text-white transition flex items-center gap-2">
            <i class="fa-solid fa-pen-to-square"></i> Update Task Progress
          </button>
        </div>
      </div>

      <div class="grid grid-cols-4 gap-4">
        <div class="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <span class="text-slate-400 text-xs block">Total Duration</span>
          <b class="text-xl text-white font-mono" id="gantt-duration">215 Days</b>
        </div>
        <div class="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <span class="text-slate-400 text-xs block">Overall Progress</span>
          <b class="text-xl text-emerald-400 font-mono" id="gantt-overall-progress">62.5%</b>
        </div>
        <div class="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <span class="text-slate-400 text-xs block">Critical Path Tasks</span>
          <b class="text-xl text-red-400 font-mono" id="gantt-critical-count">8 Tasks</b>
        </div>
        <div class="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <span class="text-slate-400 text-xs block">Delay Risk Status</span>
          <b class="text-xl text-emerald-400 font-mono">ON SCHEDULE</b>
        </div>
      </div>

      <div class="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4 shadow-xl">
        <h3 class="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <i class="fa-solid fa-bars-progress text-blue-400"></i> Interactive CPM Task Schedule & Timeline Bar Graph
        </h3>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead>
              <tr class="text-slate-400 border-b border-slate-800 bg-slate-950/80">
                <th class="p-3">WBS ID</th>
                <th class="p-3">Task Name</th>
                <th class="p-3">Phase</th>
                <th class="p-3">Duration</th>
                <th class="p-3">Window (Days)</th>
                <th class="p-3">Progress</th>
                <th class="p-3">Timeline Visual</th>
                <th class="p-3">Status</th>
              </tr>
            </thead>
            <tbody id="gantt-tasks-table-body" class="divide-y divide-slate-800/60 font-mono">
              <!-- Rendered via JS -->
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ------------------------------------------------------------- -->
    <!-- FUNCTION 21: QA/QC CONCRETE CUBE LAB TESTING & DIGITAL SNAGS -->
    <!-- ------------------------------------------------------------- -->
    <div id="fn-quality" class="fn-pane hidden h-full p-8 overflow-y-auto max-w-7xl mx-auto w-full space-y-6">
      <div class="border-b border-slate-800 pb-3 flex justify-between items-center">
        <div>
          <span class="text-xs uppercase font-bold text-emerald-400 tracking-wider">Quality Assurance & Health Safety (HSE)</span>
          <h2 class="text-2xl font-bold text-white mt-0.5">Concrete Compressive Strength Testing & Digital Snag Register</h2>
          <p class="text-xs text-slate-400">BS EN 12390-3 compliant 150mm concrete cube crushing logs, slump records, and trade defect rectification tracking.</p>
        </div>
        <div class="flex gap-2">
          <button onclick="openModal('modal-log-cube-test')" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-xs font-bold text-white transition flex items-center gap-2">
            <i class="fa-solid fa-cube"></i> Log Cube Crush Test
          </button>
          <button onclick="openModal('modal-log-snag')" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold text-slate-300 transition flex items-center gap-2">
            <i class="fa-solid fa-triangle-exclamation text-amber-400"></i> Log Snag Item
          </button>
        </div>
      </div>

      <div class="grid grid-cols-4 gap-4">
        <div class="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <span class="text-slate-400 text-xs block">Total Cubes Crushed</span>
          <b class="text-xl text-white font-mono" id="qa-cubes-count">2 Tests</b>
        </div>
        <div class="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <span class="text-slate-400 text-xs block">Lab Pass Rate</span>
          <b class="text-xl text-emerald-400 font-mono" id="qa-pass-rate">100.0%</b>
        </div>
        <div class="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <span class="text-slate-400 text-xs block">Open Snags</span>
          <b class="text-xl text-amber-400 font-mono" id="qa-open-snags">1 Open</b>
        </div>
        <div class="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <span class="text-slate-400 text-xs block">Resolved Snags</span>
          <b class="text-xl text-emerald-400 font-mono" id="qa-resolved-snags">1 Resolved</b>
        </div>
      </div>

      <!-- Concrete Cubes Table -->
      <div class="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4 shadow-xl">
        <h3 class="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <i class="fa-solid fa-cubes-stacked text-emerald-400"></i> 150mm Concrete Test Cube Compressive Laboratory Register
        </h3>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead>
              <tr class="text-slate-400 border-b border-slate-800 bg-slate-950/80">
                <th class="p-3">Sample ID</th>
                <th class="p-3">Pour Location</th>
                <th class="p-3">Structural Element</th>
                <th class="p-3">Grade</th>
                <th class="p-3">Slump</th>
                <th class="p-3">7-Day MPa</th>
                <th class="p-3">28-Day MPa</th>
                <th class="p-3">Lab Authority</th>
                <th class="p-3">Result</th>
              </tr>
            </thead>
            <tbody id="qa-cube-table-body" class="divide-y divide-slate-800/60 font-mono">
              <!-- Rendered via JS -->
            </tbody>
          </table>
        </div>
      </div>

      <!-- Snag List Table -->
      <div class="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4 shadow-xl">
        <h3 class="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <i class="fa-solid fa-clipboard-check text-amber-400"></i> Quality Snag List & Defect Rectification Register
        </h3>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead>
              <tr class="text-slate-400 border-b border-slate-800 bg-slate-950/80">
                <th class="p-3">Snag ID</th>
                <th class="p-3">Location</th>
                <th class="p-3">Trade</th>
                <th class="p-3">Description</th>
                <th class="p-3">Severity</th>
                <th class="p-3">Assigned Trade</th>
                <th class="p-3">Status</th>
                <th class="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody id="qa-snags-table-body" class="divide-y divide-slate-800/60">
              <!-- Rendered via JS -->
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ------------------------------------------------------------- -->
    <!-- FUNCTION 22: MORTGAGE & DUAL-CURRENCY FINANCING SIMULATOR -->
    <!-- ------------------------------------------------------------- -->
    <div id="fn-mortgage" class="fn-pane hidden h-full p-8 overflow-y-auto max-w-7xl mx-auto w-full space-y-6">
      <div class="border-b border-slate-800 pb-3 flex justify-between items-center">
        <div>
          <span class="text-xs uppercase font-bold text-amber-400 tracking-wider">Financial Engineering & Homeowner Credit</span>
          <h2 class="text-2xl font-bold text-white mt-0.5">Dual-Currency Mortgage & Installment Financing Simulator</h2>
          <p class="text-xs text-slate-400">Amortization calculator supporting USD Nostro and local Zimbabwe Gold (ZWG at RBZ 26.50) with monthly schedules.</p>
        </div>
      </div>

      <div class="grid grid-cols-3 gap-6">
        <!-- Input Parameters -->
        <div class="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4 shadow-xl">
          <h3 class="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <i class="fa-solid fa-sliders text-amber-400"></i> Loan Parameters
          </h3>
          <div class="space-y-3 text-xs">
            <div>
              <label class="text-slate-400 block mb-1">Property Purchase Price (USD):</label>
              <input type="number" id="mort-price" value="55000" min="5000" max="500000" oninput="runMortgageCalc()" class="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono">
            </div>
            <div>
              <label class="text-slate-400 block mb-1">Deposit Percentage (%):</label>
              <input type="number" id="mort-deposit" value="20" min="5" max="80" oninput="runMortgageCalc()" class="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono">
            </div>
            <div>
              <label class="text-slate-400 block mb-1">Loan Tenure (Years):</label>
              <select id="mort-term" onchange="runMortgageCalc()" class="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white">
                <option value="1">1 Year (12 Months - Land Only)</option>
                <option value="2">2 Years (24 Months)</option>
                <option value="3">3 Years (36 Months)</option>
                <option value="5" selected>5 Years (60 Months - Standard Turnkey)</option>
                <option value="10">10 Years (120 Months)</option>
              </select>
            </div>
            <div>
              <label class="text-slate-400 block mb-1">Annual Interest Rate (%):</label>
              <input type="number" id="mort-rate" value="12.0" step="0.5" min="0" max="30" oninput="runMortgageCalc()" class="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono">
            </div>
          </div>
        </div>

        <!-- Calculated Summary -->
        <div class="col-span-2 space-y-6">
          <div class="grid grid-cols-2 gap-4">
            <div class="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-1">
              <span class="text-xs text-slate-400 uppercase font-bold">Monthly Repayment (USD)</span>
              <h4 id="mort-out-monthly-usd" class="text-2xl font-black text-emerald-400 font-mono">$978.78</h4>
              <p class="text-[11px] text-slate-400">Fixed monthly installment for loan duration</p>
            </div>
            <div class="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-1">
              <span class="text-xs text-slate-400 uppercase font-bold">Monthly Repayment (ZWG)</span>
              <h4 id="mort-out-monthly-zwg" class="text-2xl font-black text-amber-400 font-mono">ZWG 25,937.67</h4>
              <p class="text-[11px] text-slate-400">Calculated at official RBZ rate 26.50</p>
            </div>
            <div class="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-1">
              <span class="text-xs text-slate-400 uppercase font-bold">Deposit Required</span>
              <h4 id="mort-out-deposit" class="text-xl font-bold text-white font-mono">$11,000.00 USD</h4>
              <p class="text-[11px] text-slate-400">ZWG 291,500.00 due at contract signing</p>
            </div>
            <div class="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-1">
              <span class="text-xs text-slate-400 uppercase font-bold">Total Interest Payable</span>
              <h4 id="mort-out-interest" class="text-xl font-bold text-purple-400 font-mono">$14,726.80 USD</h4>
              <p class="text-[11px] text-slate-400">Principal financed: $44,000.00 USD</p>
            </div>
          </div>

          <!-- First 12 Months Amortization Preview Table -->
          <div class="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-3 shadow-xl">
            <h3 class="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <i class="fa-solid fa-table-list text-emerald-400"></i> Amortization Schedule (First 12 Months)
            </h3>
            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead>
                  <tr class="text-slate-400 border-b border-slate-800 bg-slate-950/80">
                    <th class="p-2.5">Month</th>
                    <th class="p-2.5">Installment</th>
                    <th class="p-2.5">Principal Paid</th>
                    <th class="p-2.5">Interest Charge</th>
                    <th class="p-2.5">Closing Balance</th>
                  </tr>
                </thead>
                <tbody id="mort-amort-body" class="divide-y divide-slate-800/60 font-mono text-[11px]">
                  <!-- Rendered via JS -->
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ------------------------------------------------------------- -->
    <!-- FUNCTION 23: MUNICIPAL PERMITS & HABITATION CERTIFICATES -->
    <!-- ------------------------------------------------------------- -->
    <div id="fn-permits" class="fn-pane hidden h-full p-8 overflow-y-auto max-w-7xl mx-auto w-full space-y-6">
      <div class="border-b border-slate-800 pb-3 flex justify-between items-center">
        <div>
          <span class="text-xs uppercase font-bold text-purple-400 tracking-wider">Statutory Building Ordinances</span>
          <h2 class="text-2xl font-bold text-white mt-0.5">Municipal Building Permits & 6-Stage Statutory Inspections</h2>
          <p class="text-xs text-slate-400">Enforcement of Model Building By-laws [SI 562 of 1977], Urban Councils Act [Ch 29:15] and Certificate of Habitation.</p>
        </div>
        <button onclick="openModal('modal-signoff-permit')" class="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-xl text-xs font-bold text-white transition flex items-center gap-2">
          <i class="fa-solid fa-file-circle-check"></i> Sign Off Inspection Stage
        </button>
      </div>

      <div class="grid grid-cols-3 gap-4">
        <div class="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <span class="text-slate-400 text-xs block">Statutory Progress</span>
          <b class="text-xl text-white font-mono" id="permit-stages-cleared">4 of 6 Stages Cleared</b>
        </div>
        <div class="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <span class="text-slate-400 text-xs block">Compliance Percentage</span>
          <b class="text-xl text-purple-400 font-mono" id="permit-compliance-pct">66.7%</b>
        </div>
        <div class="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <span class="text-slate-400 text-xs block">Certificate of Habitation</span>
          <b class="text-xl text-amber-400 font-mono" id="permit-habitation-status">PENDING STAGES 5 & 6</b>
        </div>
      </div>

      <div class="space-y-4" id="permits-stages-container">
        <!-- Rendered via JS -->
      </div>
    </div>
  </div>

  <!-- ================================================================= -->
  <!-- MODALS -->"""

    content = content.replace(panes_target, new_panes, 1)

    # 3. Add New Modals: modal-update-task, modal-log-cube-test, modal-log-snag, modal-signoff-permit
    modals_code = """
  <!-- MODAL: UPDATE GANTT TASK -->
  <div id="modal-update-task" class="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center hidden p-4">
    <div class="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
      <div class="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-950">
        <h3 class="text-base font-bold text-white">Update Gantt Task Progress</h3>
        <button onclick="closeModal('modal-update-task')" class="text-slate-400 hover:text-white text-lg"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="p-6 space-y-4 text-xs">
        <div>
          <label class="text-slate-400 block mb-1">Select Schedule Task:</label>
          <select id="modal-task-select" class="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white">
            <option value="TSK-04">TSK-04: Deep Gravity Sewer Pipeline</option>
            <option value="TSK-05">TSK-05: Potable Water Reticulation</option>
            <option value="TSK-06">TSK-06: Dual Asphalt Spine Road</option>
            <option value="TSK-07">TSK-07: 11kV Electrical Feeder</option>
            <option value="TSK-08" selected>TSK-08: Turnkey House Foundation</option>
            <option value="TSK-09">TSK-09: Superstructure Brickwork</option>
          </select>
        </div>
        <div>
          <label class="text-slate-400 block mb-1">Progress Percentage (%):</label>
          <input type="number" id="modal-task-pct" value="60" min="0" max="100" class="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono">
        </div>
        <div>
          <label class="text-slate-400 block mb-1">Task Status:</label>
          <select id="modal-task-status" class="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white">
            <option value="IN_PROGRESS" selected>IN PROGRESS</option>
            <option value="COMPLETED">COMPLETED</option>
            <option value="DELAYED">DELAYED</option>
          </select>
        </div>
        <div class="flex gap-3 pt-2">
          <button onclick="closeModal('modal-update-task')" class="flex-1 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 font-bold">Cancel</button>
          <button onclick="submitTaskUpdate()" class="flex-1 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-white font-bold">Save Update</button>
        </div>
      </div>
    </div>
  </div>

  <!-- MODAL: LOG CONCRETE CUBE TEST -->
  <div id="modal-log-cube-test" class="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center hidden p-4">
    <div class="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
      <div class="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-950">
        <h3 class="text-base font-bold text-white">Log Concrete Test Cube Crushing</h3>
        <button onclick="closeModal('modal-log-cube-test')" class="text-slate-400 hover:text-white text-lg"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="p-6 space-y-3 text-xs">
        <div>
          <label class="text-slate-400 block mb-1">Pour Location:</label>
          <input type="text" id="cube-loc" value="Stand 001 Ring Beam & Lintel" class="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white">
        </div>
        <div>
          <label class="text-slate-400 block mb-1">Structural Element:</label>
          <input type="text" id="cube-elem" value="Ring Beam" class="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white">
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="text-slate-400 block mb-1">Grade (Target MPa):</label>
            <select id="cube-grade" class="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white">
              <option value="C25" selected>C25 (25.0 MPa)</option>
              <option value="C30">C30 (30.0 MPa)</option>
              <option value="C35">C35 (35.0 MPa)</option>
            </select>
          </div>
          <div>
            <label class="text-slate-400 block mb-1">Slump (mm):</label>
            <input type="number" id="cube-slump" value="95" class="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono">
          </div>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="text-slate-400 block mb-1">7-Day Strength (MPa):</label>
            <input type="number" id="cube-7d" value="21.5" step="0.1" class="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono">
          </div>
          <div>
            <label class="text-slate-400 block mb-1">28-Day Strength (MPa):</label>
            <input type="number" id="cube-28d" value="31.2" step="0.1" class="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono">
          </div>
        </div>
        <div class="flex gap-3 pt-2">
          <button onclick="closeModal('modal-log-cube-test')" class="flex-1 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 font-bold">Cancel</button>
          <button onclick="submitCubeTest()" class="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-white font-bold">Submit Lab Test</button>
        </div>
      </div>
    </div>
  </div>

  <!-- MODAL: LOG SNAG -->
  <div id="modal-log-snag" class="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center hidden p-4">
    <div class="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
      <div class="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-950">
        <h3 class="text-base font-bold text-white">Log Construction Defect / Snag</h3>
        <button onclick="closeModal('modal-log-snag')" class="text-slate-400 hover:text-white text-lg"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="p-6 space-y-3 text-xs">
        <div>
          <label class="text-slate-400 block mb-1">Defect Location:</label>
          <input type="text" id="snag-loc" value="Stand 001 - En-suite Bathroom" class="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white">
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="text-slate-400 block mb-1">Trade Category:</label>
            <select id="snag-trade" class="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white">
              <option value="Plumbing" selected>Plumbing</option>
              <option value="Electrical">Electrical</option>
              <option value="Carpentry">Carpentry</option>
              <option value="Painting">Painting</option>
              <option value="Tiling">Tiling</option>
            </select>
          </div>
          <div>
            <label class="text-slate-400 block mb-1">Severity:</label>
            <select id="snag-sev" class="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white">
              <option value="MINOR" selected>Minor Defect</option>
              <option value="MAJOR">Major Snag</option>
              <option value="CRITICAL">Critical Safety Stop</option>
            </select>
          </div>
        </div>
        <div>
          <label class="text-slate-400 block mb-1">Defect Description:</label>
          <input type="text" id="snag-desc" value="Shower mixer cartridge stiff, requires pressure balance" class="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white">
        </div>
        <div>
          <label class="text-slate-400 block mb-1">Assigned Subcontractor:</label>
          <input type="text" id="snag-sub" value="Apex Sanitary Plumbers" class="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white">
        </div>
        <div class="flex gap-3 pt-2">
          <button onclick="closeModal('modal-log-snag')" class="flex-1 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 font-bold">Cancel</button>
          <button onclick="submitSnagLog()" class="flex-1 py-2 bg-amber-600 hover:bg-amber-500 rounded-xl text-slate-950 font-black">Record Snag</button>
        </div>
      </div>
    </div>
  </div>

  <!-- MODAL: SIGNOFF STATUTORY PERMIT -->
  <div id="modal-signoff-permit" class="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center hidden p-4">
    <div class="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
      <div class="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-950">
        <h3 class="text-base font-bold text-white">Municipal Statutory Signoff</h3>
        <button onclick="closeModal('modal-signoff-permit')" class="text-slate-400 hover:text-white text-lg"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="p-6 space-y-3 text-xs">
        <div>
          <label class="text-slate-400 block mb-1">Select Inspection Stage:</label>
          <select id="permit-stage-select" class="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white">
            <option value="5" selected>Stage 5: Roof Framing & Hurricane Tie-Downs</option>
            <option value="6">Stage 6: Final Drainage, Plumbing & Habitation Certificate</option>
          </select>
        </div>
        <div>
          <label class="text-slate-400 block mb-1">Authorizing Building Inspector:</label>
          <input type="text" id="permit-inspector" value="City Building Inspector Moyo" class="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white">
        </div>
        <div class="flex gap-3 pt-2">
          <button onclick="closeModal('modal-signoff-permit')" class="flex-1 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 font-bold">Cancel</button>
          <button onclick="submitPermitSignoff()" class="flex-1 py-2 bg-purple-600 hover:bg-purple-500 rounded-xl text-white font-bold">Certify & Signoff</button>
        </div>
      </div>
    </div>
  </div>
"""

    if "modal-update-task" not in content:
        content = content.replace("  <!-- MODALS -->", "  <!-- MODALS -->\n" + modals_code, 1)

    # 4. Add JavaScript renderers & API connectors for the 4 modules
    js_target = "    // INITIAL LOAD\n    selectJobRole('ceo');"
    new_js_code = """    // =========================================================
    // MODULE 20: GANTT SCHEDULE & CPM JAVASCRIPT
    // =========================================================
    async function loadGanttSchedule() {
      try {
        const res = await fetch('/api/project/schedule', { headers: { 'X-User-Role': currentRole } });
        const data = await res.json();
        document.getElementById('gantt-duration').innerText = `${data.total_duration_days} Days`;
        document.getElementById('gantt-overall-progress').innerText = `${data.overall_progress_pct}%`;
        document.getElementById('gantt-critical-count').innerText = `${data.critical_path_tasks_count} Tasks`;

        const body = document.getElementById('gantt-tasks-table-body');
        body.innerHTML = '';
        data.tasks.forEach(t => {
          const isCrit = t.is_critical_path;
          const statusColors = {
            COMPLETED: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
            IN_PROGRESS: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
            NOT_STARTED: 'bg-slate-800 text-slate-400',
            DELAYED: 'bg-red-500/20 text-red-400 border border-red-500/30'
          };
          const tr = document.createElement('tr');
          tr.className = 'hover:bg-slate-800/40 transition';
          tr.innerHTML = `
            <td class="p-3 font-bold ${isCrit ? 'text-red-400' : 'text-slate-300'}">${t.task_id}</td>
            <td class="p-3 text-white font-sans font-semibold">${t.task_name} ${isCrit ? '<span class="text-[9px] text-red-400 font-bold ml-1 uppercase">[CPM]</span>' : ''}</td>
            <td class="p-3 text-slate-400 font-sans">${t.phase}</td>
            <td class="p-3 text-slate-300">${t.duration_days}d</td>
            <td class="p-3 text-slate-400">Day ${t.start_day} - ${t.end_day}</td>
            <td class="p-3 font-bold text-emerald-400">${t.progress_pct}%</td>
            <td class="p-3 w-48">
              <div class="w-full bg-slate-950 rounded-full h-2 border border-slate-800 overflow-hidden">
                <div class="${isCrit ? 'bg-red-500' : 'bg-blue-500'} h-2 rounded-full" style="width: ${t.progress_pct}%"></div>
              </div>
            </td>
            <td class="p-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${statusColors[t.status]}">${t.status}</span></td>
          `;
          body.appendChild(tr);
        });
      } catch (e) {
        console.error('Schedule fetch error:', e);
      }
    }

    async function submitTaskUpdate() {
      const taskId = document.getElementById('modal-task-select').value;
      const pct = parseInt(document.getElementById('modal-task-pct').value) || 0;
      const status = document.getElementById('modal-task-status').value;
      closeModal('modal-update-task');

      try {
        const res = await fetch('/api/project/task/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-User-Role': currentRole },
          body: JSON.stringify({ task_id: taskId, progress_pct: pct, status: status })
        });
        const data = await res.json();
        alert(`Task ${taskId} updated to ${pct}% (${status})! HMAC: ${data.hmac_signature ? data.hmac_signature.substring(0, 12) : ''}`);
        loadGanttSchedule();
      } catch (e) {
        alert('Update error: ' + e);
      }
    }

    // =========================================================
    // MODULE 21: QUALITY QA/QC & SNAGS JAVASCRIPT
    // =========================================================
    async function loadQualitySummary() {
      try {
        const res = await fetch('/api/quality/summary', { headers: { 'X-User-Role': currentRole } });
        const data = await res.json();
        document.getElementById('qa-cubes-count').innerText = `${data.total_cube_tests} Tests`;
        document.getElementById('qa-pass-rate').innerText = `${data.pass_rate_pct}%`;
        document.getElementById('qa-open-snags').innerText = `${data.open_snags} Open`;
        document.getElementById('qa-resolved-snags').innerText = `${data.resolved_snags} Resolved`;

        // Render cubes
        const cubeBody = document.getElementById('qa-cube-table-body');
        cubeBody.innerHTML = '';
        data.cube_tests.forEach(c => {
          const tr = document.createElement('tr');
          tr.className = 'hover:bg-slate-800/40 transition';
          tr.innerHTML = `
            <td class="p-3 font-bold text-white">${c.test_id}</td>
            <td class="p-3 text-slate-300 font-sans">${c.pour_location}</td>
            <td class="p-3 text-slate-400 font-sans">${c.structural_element}</td>
            <td class="p-3 text-amber-400 font-bold">${c.mix_designation}</td>
            <td class="p-3 text-slate-300">${c.slump_mm} mm</td>
            <td class="p-3 text-slate-400">${c.strength_7day_mpa} MPa</td>
            <td class="p-3 font-bold text-emerald-400">${c.strength_28day_mpa} MPa</td>
            <td class="p-3 text-slate-400 font-sans">${c.tested_by}</td>
            <td class="p-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${c.passed ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}">${c.passed ? 'PASSED' : 'FAILED'}</span></td>
          `;
          cubeBody.appendChild(tr);
        });

        // Render snags
        const snagBody = document.getElementById('qa-snags-table-body');
        snagBody.innerHTML = '';
        data.snag_items.forEach(s => {
          const tr = document.createElement('tr');
          tr.className = 'hover:bg-slate-800/40 transition';
          tr.innerHTML = `
            <td class="p-3 font-bold text-white font-mono">${s.snag_id}</td>
            <td class="p-3 text-slate-300">${s.location}</td>
            <td class="p-3 text-slate-400">${s.trade}</td>
            <td class="p-3 text-slate-200">${s.description}</td>
            <td class="p-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${s.severity === 'CRITICAL' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'}">${s.severity}</span></td>
            <td class="p-3 text-slate-400 font-mono">${s.assigned_subcontractor}</td>
            <td class="p-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${s.resolved ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}">${s.resolved ? 'RESOLVED' : 'OPEN'}</span></td>
            <td class="p-3 text-right">
              ${s.resolved ? '<span class="text-slate-500 text-[10px]">Rectified</span>' : `<button onclick="resolveSnagItem('${s.snag_id}')" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-bold">Resolve</button>`}
            </td>
          `;
          snagBody.appendChild(tr);
        });
      } catch (e) {
        console.error('Quality fetch error:', e);
      }
    }

    async function submitCubeTest() {
      const loc = document.getElementById('cube-loc').value;
      const elem = document.getElementById('cube-elem').value;
      const grade = document.getElementById('cube-grade').value;
      const slump = parseInt(document.getElementById('cube-slump').value) || 90;
      const s7 = parseFloat(document.getElementById('cube-7d').value) || 20.0;
      const s28 = parseFloat(document.getElementById('cube-28d').value) || 30.0;
      closeModal('modal-log-cube-test');

      try {
        const res = await fetch('/api/quality/cube-test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-User-Role': currentRole },
          body: JSON.stringify({ pour_location: loc, structural_element: elem, mix_designation: grade, slump_mm: slump, strength_7day_mpa: s7, strength_28day_mpa: s28, tested_by: 'SAZ Harare' })
        });
        const data = await res.json();
        alert(`Concrete test ${data.test_id} recorded: 28-Day Strength ${data.strength_28day_mpa} MPa (${data.passed ? 'PASSED' : 'FAILED'})!`);
        loadQualitySummary();
      } catch (e) {
        alert('Cube test error: ' + e);
      }
    }

    async function submitSnagLog() {
      const loc = document.getElementById('snag-loc').value;
      const trade = document.getElementById('snag-trade').value;
      const desc = document.getElementById('snag-desc').value;
      const sev = document.getElementById('snag-sev').value;
      const sub = document.getElementById('snag-sub').value;
      closeModal('modal-log-snag');

      try {
        const res = await fetch('/api/quality/snag/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-User-Role': currentRole },
          body: JSON.stringify({ location: loc, trade: trade, description: desc, severity: sev, assigned_subcontractor: sub, photo_hash: 'hash_snag_' + Date.now() })
        });
        const data = await res.json();
        alert(`Snag ${data.snag_id} recorded for ${loc}!`);
        loadQualitySummary();
      } catch (e) {
        alert('Snag logging error: ' + e);
      }
    }

    async function resolveSnagItem(snagId) {
      try {
        const res = await fetch('/api/quality/snag/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-User-Role': currentRole },
          body: JSON.stringify({ snag_id: snagId })
        });
        const data = await res.json();
        alert(`Snag ${snagId} marked as resolved!`);
        loadQualitySummary();
      } catch (e) {
        alert('Resolve error: ' + e);
      }
    }

    // =========================================================
    // MODULE 22: MORTGAGE FINANCING JAVASCRIPT
    // =========================================================
    async function runMortgageCalc() {
      const price = parseFloat(document.getElementById('mort-price').value) || 55000;
      const depPct = parseFloat(document.getElementById('mort-deposit').value) || 20;
      const termYears = parseInt(document.getElementById('mort-term').value) || 5;
      const ratePct = parseFloat(document.getElementById('mort-rate').value) || 12.0;

      try {
        const res = await fetch('/api/mortgage/calculate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-User-Role': currentRole },
          body: JSON.stringify({ property_price_usd: price, deposit_pct: depPct, loan_term_years: termYears, annual_interest_rate_pct: ratePct })
        });
        const data = await res.json();

        document.getElementById('mort-out-monthly-usd').innerText = `$${data.monthly_installment_usd.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        document.getElementById('mort-out-monthly-zwg').innerText = `ZWG ${data.monthly_installment_zwg.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        document.getElementById('mort-out-deposit').innerText = `$${data.deposit_usd.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} USD`;
        document.getElementById('mort-out-interest').innerText = `$${data.total_interest_usd.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} USD`;

        const body = document.getElementById('mort-amort-body');
        body.innerHTML = '';
        data.amortization_preview.forEach(row => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td class="p-2.5 font-bold text-white">Month ${row.month}</td>
            <td class="p-2.5 text-emerald-400 font-bold">$${row.monthly_installment_usd.toFixed(2)}</td>
            <td class="p-2.5 text-slate-300">$${row.principal_usd.toFixed(2)}</td>
            <td class="p-2.5 text-amber-400">$${row.interest_usd.toFixed(2)}</td>
            <td class="p-2.5 text-purple-400 font-bold">$${row.closing_balance_usd.toFixed(2)}</td>
          `;
          body.appendChild(tr);
        });
      } catch (e) {
        console.error('Mortgage calc error:', e);
      }
    }

    // =========================================================
    // MODULE 23: MUNICIPAL PERMITS JAVASCRIPT
    // =========================================================
    async function loadMunicipalPermits() {
      try {
        const res = await fetch('/api/permits/overview', { headers: { 'X-User-Role': currentRole } });
        const data = await res.json();
        document.getElementById('permit-stages-cleared').innerText = `${data.stages_cleared} of 6 Stages Cleared`;
        document.getElementById('permit-compliance-pct').innerText = `${data.compliance_pct}%`;
        document.getElementById('permit-habitation-status').innerText = data.ready_for_occupancy ? 'ISSUED & OCCUPANCY APPROVED' : 'PENDING STAGES 5 & 6';
        document.getElementById('permit-habitation-status').className = data.ready_for_occupancy ? 'text-xl text-emerald-400 font-mono font-bold' : 'text-xl text-amber-400 font-mono';

        const cont = document.getElementById('permits-stages-container');
        cont.innerHTML = '';
        data.stages.forEach(stg => {
          const isPassed = stg.status === 'PASSED';
          const card = document.createElement('div');
          card.className = `p-4 rounded-xl border ${isPassed ? 'bg-slate-900 border-emerald-500/30' : 'bg-slate-950 border-slate-800'} flex items-center justify-between shadow-lg`;
          card.innerHTML = `
            <div class="flex items-center gap-4">
              <div class="w-10 h-10 rounded-xl ${isPassed ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-500'} flex items-center justify-center font-black text-sm">
                ${isPassed ? '<i class="fa-solid fa-check"></i>' : stg.stage_id}
              </div>
              <div>
                <h4 class="text-sm font-bold text-white">${stg.stage_name}</h4>
                <p class="text-[11px] text-slate-400">${stg.statutory_authority} • Ref: <span class="font-mono text-purple-400">${stg.reference_code}</span></p>
                <p class="text-[10px] text-slate-500">Inspector: ${stg.inspected_by} ${stg.date_cleared ? '• Cleared on ' + stg.date_cleared : ''}</p>
              </div>
            </div>
            <span class="px-3 py-1 rounded text-xs font-bold ${isPassed ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-400'}">${stg.status}</span>
          `;
          cont.appendChild(card);
        });
      } catch (e) {
        console.error('Permits fetch error:', e);
      }
    }

    async function submitPermitSignoff() {
      const stgId = parseInt(document.getElementById('permit-stage-select').value) || 5;
      const inspector = document.getElementById('permit-inspector').value;
      closeModal('modal-signoff-permit');

      try {
        const res = await fetch('/api/permits/signoff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-User-Role': currentRole },
          body: JSON.stringify({ stage_id: stgId, inspector_name: inspector, certificate_hash: 'hash_statutory_cert_' + Date.now() })
        });
        const data = await res.json();
        alert(`Statutory Stage ${data.stage_id} successfully signed off! Certificate: ${data.certificate_hash.substring(0, 16)}...`);
        loadMunicipalPermits();
      } catch (e) {
        alert('Signoff error: ' + e);
      }
    }

    // Connect function tab switching to load data
    const origShowFn = window.showFunction;
"""

    if "loadGanttSchedule" not in content:
        content = content.replace(js_target, new_js_code + "\n" + js_target, 1)

    # 5. Hook into showFunction to trigger loading
    hook_target = "if (fn === 'sysadmin') refreshSecurityAuditTable();"
    new_hooks = """if (fn === 'sysadmin') refreshSecurityAuditTable();
      if (fn === 'schedule') loadGanttSchedule();
      if (fn === 'quality') loadQualitySummary();
      if (fn === 'mortgage') runMortgageCalc();
      if (fn === 'permits') loadMunicipalPermits();"""
    content = content.replace(hook_target, new_hooks, 1)

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)

    print("Successfully added Modules 20, 21, 22, 23 to build_full_enterprise_erp.py!")

if __name__ == "__main__":
    main()
