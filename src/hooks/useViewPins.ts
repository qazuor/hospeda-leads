import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {useRef} from 'react';
import {toast} from 'sonner';
import {getViewPins,postViewPins,type OutputType, type ViewPinsConfig} from '../endpoints/view_pins.schema';
import {crmError} from '../helpers/crmErrors';
export function useViewPins(){
 const client=useQueryClient(),query=useQuery({queryKey:['view_pins'],queryFn:getViewPins}),pinBusy=useRef(false);
 const mutation=useMutation({mutationFn:postViewPins,onSuccess:()=>client.invalidateQueries({queryKey:['view_pins']})});
 const config=(entity:'business'|'opportunity')=>query.data?.[entity]??null;
 const save=async(entity:'business'|'opportunity',value:ViewPinsConfig)=>mutation.mutateAsync({entity,config:value});
 const reset=async(entity:'business'|'opportunity')=>mutation.mutateAsync({entity,config:null});
 const pin=async(entity:'business'|'opportunity',key:string,resolvedKeys:string[])=>{if(pinBusy.current||mutation.isPending||query.isLoading||!query.data)return;pinBusy.current=true;const previous=client.getQueryData<OutputType>(['view_pins'])??{};const current=previous[entity]??{order:[],hidden:[]};const order=[...resolvedKeys.filter(item=>item!==key),key],hidden=current.hidden.filter(item=>item!==key);client.setQueryData<OutputType>(['view_pins'],{...previous,[entity]:{order,hidden}});try{await mutation.mutateAsync({entity,config:{order,hidden}});}catch(error){client.setQueryData(['view_pins'],previous);toast.error(error instanceof Error?crmError(error):'No se pudo fijar la vista');}finally{pinBusy.current=false;}};
 return {config,save,reset,pin,isLoading:query.isLoading,isError:query.isError,isPending:mutation.isPending||pinBusy.current};
}
