import {useCallback,useRef} from 'react';
import {useMutation,type DefaultError,type UseMutationOptions,type UseMutationResult, type QueryClient} from '@tanstack/react-query';

/** Ignore a repeated UI submission before React has rendered the pending state. */
export function useGuardedMutation<TData=unknown,TError=DefaultError,TVariables=void,TContext=unknown>(options:UseMutationOptions<TData,TError,TVariables,TContext>,queryClient?:QueryClient):UseMutationResult<TData,TError,TVariables,TContext>{
 const mutation=useMutation(options,queryClient);
 const locked=useRef(false);
 const mutate=useCallback<UseMutationResult<TData,TError,TVariables,TContext>['mutate']>((...args)=>{
  if(locked.current)return;
  locked.current=true;
  void mutation.mutateAsync(...args).catch(()=>undefined).finally(()=>{locked.current=false});
 },[mutation.mutateAsync]);
 return {...mutation,mutate};
}
