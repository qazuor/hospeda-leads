import React from "react";
import {ArrowDownAZ,ArrowUpAZ,ChevronDown} from "lucide-react";
import {Popover,PopoverTrigger,PopoverContent} from "./Popover";
import {Button} from "./Button";
import type {SortBy} from "../helpers/leadsTableModel";
import styles from "../pages/_index.module.css";
export function HeaderMenu({
  label,field,sortBy,sortDir,onSort,children
}:{
  label:string;field:SortBy;sortBy:SortBy;sortDir:"asc"|"desc";
  onSort:(field:SortBy,dir:"asc"|"desc")=>void;children?:React.ReactNode;
}){
  return <Popover>
    <PopoverTrigger asChild>
      <button className={styles.headerButton} title={"Ordenar por "+label}>
        <span>{label}</span>
        {sortBy===field?(sortDir==="asc"?<ArrowUpAZ size={14}/>:<ArrowDownAZ size={14}/>):<ChevronDown size={14}/>}
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" className={styles.headerPopover}>
      <div className={styles.headerPopoverTitle}>{label}</div>
      <div className={styles.sortButtons}>
        <Button size="sm" variant={sortBy===field&&sortDir==="asc"?"secondary":"outline"} onClick={()=>onSort(field,"asc")}><ArrowUpAZ size={14}/>Ascendente</Button>
        <Button size="sm" variant={sortBy===field&&sortDir==="desc"?"secondary":"outline"} onClick={()=>onSort(field,"desc")}><ArrowDownAZ size={14}/>Descendente</Button>
      </div>
      {children&&<div className={styles.headerFilter}>{children}</div>}
    </PopoverContent>
  </Popover>;
}

