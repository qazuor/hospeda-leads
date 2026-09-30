import React from "react";
import { AutoComplete, type Option } from "./AutoComplete";
import styles from "./SearchSelect.module.css";

type Props={
  value:string;
  options:string[];
  onChange:(value:string)=>void;
  placeholder?:string;
  disabled?:boolean;
  className?:string;
};

export const SearchSelect=({value,options,onChange,placeholder,disabled,className}:Props)=>{
  const opts:Option[]=options.map(x=>({value:x,label:x,displayText:x}));
  const selected=opts.find(x=>x.value===value);
  return <div className={className}>
    <AutoComplete
      options={opts}
      value={selected}
      inputValue={value}
      onInputValueChange={onChange}
      onValueChange={option=>onChange(option.value)}
      emptyMessage="Sin resultados"
      placeholder={placeholder}
      disabled={disabled}
      allowFreeForm={false}
    />
  </div>;
};