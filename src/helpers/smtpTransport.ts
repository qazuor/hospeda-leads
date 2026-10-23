import nodemailer,{type SendMailOptions} from 'nodemailer';

const loopback=(host:string)=>['127.0.0.1','::1','localhost'].includes(host.toLowerCase());
export function smtpConfigured(){return !!(process.env.BREVO_SMTP_LOGIN?.trim()&&process.env.BREVO_SMTP_KEY?.trim());}
export async function sendSmtpMail(message:SendMailOptions){
 const host=process.env.BREVO_SMTP_HOST?.trim()||'smtp-relay.brevo.com',port=Number(process.env.BREVO_SMTP_PORT||587),local=loopback(host);
 if(!local&&!smtpConfigured())throw new Error('SMTP de Brevo no configurado');
 const transport=nodemailer.createTransport({host,port,secure:false,requireTLS:!local,auth:{user:process.env.BREVO_SMTP_LOGIN||'test',pass:process.env.BREVO_SMTP_KEY||'test'},connectionTimeout:20000,greetingTimeout:20000,socketTimeout:20000});
 try{return await transport.sendMail(message);}finally{transport.close();}
}
