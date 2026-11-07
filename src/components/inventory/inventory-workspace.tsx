"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {readInventory} from "@/lib/inventory/client";
import {displayQuantity,signedQuantity,formatUnitCost,itemTypes,stockStatus,type InventoryData,type InventoryItem,type Movement} from "@/lib/inventory/domain";
import {money} from "@/lib/sales/domain";
import {useBeginLoading} from "../ui/global-loading-bar";
import {WorkspaceSkeleton} from "../ui/workspace-skeleton";
import {Button} from "../ui/button";
import {Card} from "../ui/card";
import {DataTable} from "../ui/data-table";
import {Select} from "../ui/select";
import {ItemDetails, InventoryStatus} from "./item-details";
import {DateRangeFilter} from "../date-range-filter";
import {InventoryItemDialog} from "./item-dialog";
import {StockDialog,type StockWorkflow} from "./stock-dialog";
import {ReturnStockDialog} from "./return-dialog";
import {MovementDetails, movementLabels as labels, movementReference} from "./movement-details";
const views=[{key:"items",label:"Stock Items"},{key:"history",label:"History"}] as const;
export function InventoryWorkspace({from,to,today}:{from:string;to:string;today:string}) {
  const [snapshot, setSnapshot] = useState<{ data: InventoryData; from: string; to: string }>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<(typeof views)[number]["key"]>("items");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [itemFilter, setItemFilter] = useState("all");
  const [movementFilter, setMovementFilter] = useState("all");
  const [selected, setSelected] = useState<InventoryItem>();
  const [selectedMovement, setSelectedMovement] = useState<Movement>();
  const [editingItem, setEditingItem] = useState<InventoryItem>();
  const detailsTrigger = useRef<HTMLElement | null>(null);



  const [activeStockModal, setActiveStockModal] = useState<{
    item?: InventoryItem;
    workflow: StockWorkflow;
  } | null>(null);

  const controller = useRef<AbortController | null>(null);
  const finishLoading = useRef<() => void>(() => {});
  const begin = useBeginLoading();

  const refresh = useCallback(async () => {
    controller.current?.abort();
    finishLoading.current();
    const request = new AbortController();
    controller.current = request;
    const finish = begin();
    finishLoading.current = finish;
    setLoading(true);
    try {
      const data = await readInventory(from, to, request.signal);
      if (!request.signal.aborted) {
        setSnapshot({ data, from, to });
        setSelected(current => current ? data.items.find(item=>item.id===current.id) : undefined);
        setError("");
      }
      return true;
    } catch (failure) {
      if (!request.signal.aborted) {
        setError(failure instanceof Error ? failure.message : "Inventory could not load. Try again.");
      }
      return false;
    } finally {
      finish();
      if (!request.signal.aborted) setLoading(false);
    }
  }, [from, to, begin]);

  useEffect(() => {
    void refresh();
    const focus = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", focus);
    return () => {
      window.removeEventListener("focus", focus);
      controller.current?.abort();
      finishLoading.current();
    };
  }, [refresh]);

  const data = snapshot?.data;
  if (!data) {
    return error ? (
      <section className="inventory-management">
        <h1>Inventory</h1>
        <p role="alert" className="form-message error">
          {error}
        </p>
        <div>
          <Button onClick={refresh}>Try again</Button>
        </div>
      </section>
    ) : (
      <WorkspaceSkeleton module="inventory" track={false} />
    );
  }

  const active=data.items.filter(item=>item.active);
  const value=data.items.reduce((sum,item)=>sum+(item.value_cents??0),0);
  const items=data.items.filter(item=>(typeFilter==="all"||item.item_type===typeFilter)&&(statusFilter==="all"||stockStatus(item)===statusFilter));
  const history=data.movements.filter(row=>(itemFilter==="all"||row.ingredient_id===itemFilter)&&(movementFilter==="all"||row.kind===movementFilter));
  const itemFiltersActive = typeFilter !== "all" || statusFilter !== "all";
  const historyFiltersActive = itemFilter !== "all" || movementFilter !== "all";
  return <div className="menu-management inventory-management grid gap-6" aria-busy={loading}>
    <header className="inventory-header">
      <div><h1 className="m-0">Inventory</h1><p className="hint mb-0 mt-2">Manage ingredients, packaging, and finished goods.</p></div>
      <div className="inventory-header-actions">
        <InventoryItemDialog refresh={refresh} triggerLabelText="Add Item" triggerClassName="secondary" />
        <Button className="accent" disabled={!active.length} onClick={() => setActiveStockModal({workflow:"receipt"})}>Stock In</Button>
      </div>
    </header>
    {error && <p role="alert" className="form-message error">{error} Previous results remain visible. <Button variant="outline" onClick={refresh}>Retry</Button></p>}
    <dl className="menu-overview inventory-overview" aria-label="Current inventory overview">
      {[["Total Items",active.length],["Low Stock",active.filter(i=>stockStatus(i)==="Low Stock").length],["Out of Stock",active.filter(i=>stockStatus(i)==="Out of Stock").length],["Inventory Value",data.items.some(i=>i.value_cents===null)||!Number.isSafeInteger(value)?"Incomplete":money(value)]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
    <nav className="inventory-views" aria-label="Inventory views">{views.map(tab=><Button key={tab.key} variant={view===tab.key ? "default" : "outline"} aria-pressed={view===tab.key} onClick={()=>setView(tab.key)}>{tab.label}</Button>)}</nav>
    {view === "items" ? <Card className="menu-products inventory-section inventory-stock-section">
      <DataTable caption="Inventory items" searchPlaceholder="Search inventory items"
        emptyMessage={itemFiltersActive ? "No items match these filters. Choose All types or All statuses to broaden the results." : "No inventory items yet. Add an ingredient, packaging supply, or finished good to start tracking stock."}
        toolbarLeading={<div className="menu-products-heading"><h2>Stock Items</h2></div>}
        actions={<div className="menu-filter-bar inventory-filter-bar">
          <label className="field"><span className="sr-only">Item type</span><Select aria-label="Item type" value={typeFilter} onValueChange={setTypeFilter} options={[{value:"all",label:"All types"},...itemTypes]} /></label>
          <label className="field"><span className="sr-only">Stock status</span><Select aria-label="Stock status" value={statusFilter} onValueChange={setStatusFilter} options={["all","In Stock","Low Stock","Out of Stock","Inactive"].map(value=>({value,label:value==="all"?"All statuses":value}))} /></label>
        </div>}
        paginationResetKey={typeFilter+statusFilter}
        columns={[{key:"name",label:"Item",kind:"primary"},{key:"quantity",label:"On Hand",numeric:true},{key:"cost",label:"Average Unit Cost",numeric:true},{key:"value",label:"Stock Value",numeric:true},{key:"status",label:"Status",kind:"status"}]}
        rows={items.map(item=>({id:item.id,label:`Open ${item.name} details`,onActivate:()=>{detailsTrigger.current=document.querySelector<HTMLElement>(`[aria-label="${CSS.escape(`Open ${item.name} details`)}"]`);setSelected(item);},search:item.name,cells:{
          name:<><strong>{item.name}</strong><small className="cell-description">{itemTypes.find(t=>t.value===item.item_type)?.label}</small></>,
          quantity:displayQuantity(item.quantity,item.base_unit),cost:formatUnitCost(item.unit_cost_cents),value:item.value_cents===null?"Incomplete":money(item.value_cents),status:<InventoryStatus item={item} />,
        }}))} />
    </Card> : <Card className="menu-products inventory-section inventory-history-section">
      <header className="inventory-history-heading">
        <h2>History</h2>
      </header>
      <DataTable caption="Inventory movement history" searchPlaceholder="Search history"
        actions={<div className="inventory-history-filters">
          <label className="field"><span className="sr-only">Inventory item</span><Select aria-label="Inventory item" value={itemFilter} onValueChange={setItemFilter} options={[{value:"all",label:"All items"},...data.items.map(i=>({value:i.id,label:i.name}))]} /></label>
          <label className="field"><span className="sr-only">Movement type</span><Select aria-label="Movement type" value={movementFilter} onValueChange={setMovementFilter} options={[{value:"all",label:"All movements"},...Object.entries(labels).map(([value,label])=>({value,label}))]} /></label>
          <DateRangeFilter from={snapshot.from} to={snapshot.to} action="/app/inventory" label="Filter inventory movements by date" />
        </div>}
        paginationResetKey={itemFilter+movementFilter+snapshot.from+snapshot.to}
        emptyMessage={historyFiltersActive ? "No movements match these filters. Choose All items, All movements, or another date range." : "No stock movements in this reporting period."}
        columns={[{key:"date",label:"Date / Time",kind:"compact"},{key:"item",label:"Item",kind:"primary"},{key:"kind",label:"Movement"},{key:"quantity",label:"Quantity Change",numeric:true},{key:"balance",label:"Balance After",numeric:true},{key:"value",label:"Cost Change",numeric:true},{key:"details",label:"Reference / Details"}]}
        rows={history.map(row=>({id:row.id,search:row.name+" "+row.reason+" "+(row.reference??"")+" "+row.source_id,cells:{
          date:<>{new Intl.DateTimeFormat("en-PH",{dateStyle:"medium",timeZone:"UTC"}).format(new Date(`${row.occurred_on}T00:00:00Z`))}<small className="cell-description">{new Date(row.created_at).toLocaleTimeString("en-PH",{timeZone:"Asia/Manila",hour:"numeric",minute:"2-digit"})}</small></>,
          item:<strong>{row.name}</strong>,kind:labels[row.kind]??row.kind,
          quantity:<span className={Number(row.quantity_delta)<0 ? "inventory-quantity-decrease" : "inventory-quantity-increase"}>{signedQuantity(row.quantity_delta,row.base_unit)}</span>,
          balance:row.resulting_quantity===null?"Not recorded":displayQuantity(row.resulting_quantity,row.base_unit),
          value:row.value_delta_cents===null?"Not recorded":money(row.value_delta_cents),
          details:<div className="inventory-movement-reference">
            <span className="inventory-reference-label">{movementReference(row)}</span>
            <Button variant="link" size="sm" aria-label={`View details for ${row.name}`} onClick={()=>setSelectedMovement(row)}>View Details</Button>
          </div>,
        }}))} />
      {data.returnable.length > 0 && <aside className="inventory-return-context" aria-label="Eligible refunded items">
        <div><h3>Refunded finished goods</h3><p className="hint">{data.returnable.length} refunded receipt item(s) may be returned after checking they are unopened and reusable.</p></div>
        <ReturnStockDialog entries={data.returnable} refresh={refresh} />
      </aside>}
    </Card>}
    {selectedMovement && <MovementDetails movement={selectedMovement} onClose={()=>setSelectedMovement(undefined)} />}
    {selected && !editingItem && !activeStockModal && <ItemDetails item={selected} onClose={()=>{setSelected(undefined);requestAnimationFrame(()=>detailsTrigger.current?.focus());}} onStock={workflow=>setActiveStockModal({item:selected,workflow})} onEdit={()=>setEditingItem(selected)} onHistory={()=>{setItemFilter(selected.id);setView("history");setSelected(undefined);}} />}
    {editingItem && <InventoryItemDialog item={editingItem} initialOpen hideTrigger onClose={()=>setEditingItem(undefined)} refresh={refresh} />}
    {activeStockModal && <StockDialog items={data.items} item={activeStockModal.item} today={today} workflow={activeStockModal.workflow} open hideTrigger onOpenChange={open=>{if(!open)setActiveStockModal(null);}} refresh={refresh} />}
  </div>;
}
