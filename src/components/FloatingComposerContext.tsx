import React,{createContext,useContext} from 'react';

/** Lets business record contact entry points restore its single active composer. */
export type FloatingComposerContextValue={active:boolean;leadId?:string;restore:()=>void};
const Context=createContext<FloatingComposerContextValue|null>(null);
/** Provides record-scoped access to an already open floating composer. */
export function FloatingComposerProvider({value,children}:{value:FloatingComposerContextValue;children:React.ReactNode}){return <Context.Provider value={value}>{children}</Context.Provider>}
/** Returns the floating composer controller when inside a business record. */
export function useFloatingComposer(){return useContext(Context)}
