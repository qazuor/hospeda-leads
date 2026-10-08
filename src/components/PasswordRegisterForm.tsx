import { NativeSelect } from './NativeSelect';
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import * as z from "zod";
import {
  Form,FormControl,FormItem,FormLabel,FormMessage,FormDescription,useForm,
} from "./Form";
import { Input } from "./Input";
import { Button } from "./Button";
import { Spinner } from "./Spinner";
import styles from "./PasswordRegisterForm.module.css";
import { useAuth } from "../helpers/useAuth";
import { schema,postRegister } from "../endpoints/auth/register_with_password_POST.schema";

export type RegisterFormData=z.infer<typeof schema>;

interface PasswordRegisterFormProps{
  className?:string;
  invitation?:{token:string;email:string};
}

export const PasswordRegisterForm:React.FC<PasswordRegisterFormProps>=({className,invitation})=>{
  const [isLoading,setIsLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const {onLogin}=useAuth();
  const navigate=useNavigate();

  const form=useForm({
    schema,
    defaultValues:{
      email:invitation?.email??"",
      fullName:"",
      displayName:"",
      phone:"",
      sex:"prefiero_no_decir" as const,
      password:"",
      inviteToken:invitation?.token
    }
  });

  const handleSubmit=async(data:z.infer<typeof schema>)=>{
    setError(null);
    setIsLoading(true);
    try{
      const result=await postRegister(data);
      onLogin(result.user);
      navigate("/");
    }catch(err){
      setError(err instanceof Error?err.message:"No se pudo crear el acceso.");
    }finally{
      setIsLoading(false);
    }
  };

  return <Form {...form}>
    {error&&<div className={styles.errorMessage}>{error}</div>}
    <form
      onSubmit={form.handleSubmit(data=>handleSubmit(data as z.infer<typeof schema>))}
      className={`${styles.form} ${className||""}`}
    >
      <FormItem name="email">
        <FormLabel>Email</FormLabel>
        <FormControl>
          <Input
            type="email"
            value={form.values.email||""}
            readOnly={!!invitation}
            onChange={e=>form.setValues((prev:any)=>({...prev,email:e.target.value}))}
          />
        </FormControl>
        {invitation&&<FormDescription>Este email fue definido por quien te invitó.</FormDescription>}
        <FormMessage/>
      </FormItem>

      <FormItem name="fullName">
        <FormLabel>Nombre completo</FormLabel>
        <FormControl>
          <Input value={form.values.fullName||""} onChange={e=>form.setValues((prev:any)=>({...prev,fullName:e.target.value}))}/>
        </FormControl>
        <FormMessage/>
      </FormItem>

      <FormItem name="displayName">
        <FormLabel>Nombre visible</FormLabel>
        <FormControl>
          <Input value={form.values.displayName||""} onChange={e=>form.setValues((prev:any)=>({...prev,displayName:e.target.value}))}/>
        </FormControl>
        <FormDescription>Es el nombre que verá el resto del equipo dentro del CRM.</FormDescription>
        <FormMessage/>
      </FormItem>

      <FormItem name="phone">
        <FormLabel>Teléfono</FormLabel>
        <FormControl>
          <Input type="tel" value={form.values.phone||""} onChange={e=>form.setValues((prev:any)=>({...prev,phone:e.target.value}))}/>
        </FormControl>
        <FormMessage/>
      </FormItem>

      <FormItem name="sex">
        <FormLabel>Sexo</FormLabel>
        <FormControl>
          <NativeSelect
            className={styles.select}
            value={form.values.sex||"prefiero_no_decir"}
            onChange={e=>form.setValues((prev:any)=>({...prev,sex:e.target.value}))}
          >
            <option value="masculino">Masculino</option>
            <option value="femenino">Femenino</option>
            <option value="otro">Otro</option>
            <option value="prefiero_no_decir">Prefiero no decir</option>
          </NativeSelect>
        </FormControl>
        <FormMessage/>
      </FormItem>

      <FormItem name="password">
        <FormLabel>Contraseña</FormLabel>
        <FormControl>
          <Input type="password" value={form.values.password||""} onChange={e=>form.setValues((prev:any)=>({...prev,password:e.target.value}))}/>
        </FormControl>
        <FormDescription>Mínimo 8 caracteres.</FormDescription>
        <FormMessage/>
      </FormItem>

      <Button type="submit" disabled={isLoading} className={styles.submitButton}>
        {isLoading?<><Spinner size="sm"/>Creando acceso…</>:"Crear usuario e ingresar"}
      </Button>
    </form>
  </Form>;
};
