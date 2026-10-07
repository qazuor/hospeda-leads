import {useEffect, useRef, useState} from 'react';
import {Link, useSearchParams} from 'react-router-dom';
import {ArrowLeft, ArrowRight, BookOpen, CheckCircle2, Lightbulb, Search} from 'lucide-react';
import {AppHeader} from '../components/AppHeader';
import {Button} from '../components/Button';
import {Input} from '../components/Input';
import {useAuth} from '../helpers/useAuth';
import topics from '../content/user-guide.json';
import styles from './guide.module.css';

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
const entries = topics.flatMap(topic => topic.articles.map(article => ({topic, article})));

export default function GuidePage() {
  const [params] = useSearchParams();
  const [search, setSearch] = useState('');
  const topic = topics.find(item => item.id === params.get('topic')) ?? topics[0];
  const article = topic.articles.find(item => item.id === params.get('article')) ?? topic.articles[0];
  const index = topic.articles.indexOf(article);
  const {authState} = useAuth();
  const admin = authState.type === 'authenticated' && authState.user.role === 'admin';
  const title = useRef<HTMLHeadingElement>(null);
  const previous = useRef(article.id);
  const term = normalize(search);
  const results = entries.filter(({topic, article}) => normalize([topic.title, article.title, article.when, ...article.steps, article.result, ...article.example, ...article.notes].join(' ')).includes(term));
  const url = (topicId: string, articleId?: string) => '/guide?topic=' + topicId + (articleId ? '&article=' + articleId : '');
  useEffect(() => {
    if (previous.current !== article.id) {
      previous.current = article.id;
      title.current?.focus({preventScroll: true});
      title.current?.scrollIntoView({block: 'start'});
    }
  }, [article.id]);
  return <><AppHeader/><main className={styles.shell}>
    <header className={styles.hero}><div className={styles.heroIcon}><BookOpen size={26}/></div><div><span className={styles.eyebrow}>AYUDA PARA EL TRABAJO DIARIO</span><h1>Usar Hospeda, paso a paso</h1><p>Qué hacer, cómo registrarlo y cuál es el siguiente paso. No necesitás experiencia con un CRM ni con gestiones.</p></div></header>
    <div className={styles.shortcuts} aria-label="Por dónde empezar">
      <Link to={url('first', 'business')} onClick={() => setSearch('')}><strong>Quiero cargar un negocio</strong><span>Desde los datos hasta el primer contacto<ArrowRight size={16}/></span></Link>
      <Link to={url('start', 'routine')} onClick={() => setSearch('')}><strong>Quiero organizar mi día</strong><span>Qué revisar y cómo atender cada tarea<ArrowRight size={16}/></span></Link>
      <Link to={url('example', 'full-example')} onClick={() => setSearch('')}><strong>Quiero ver un ejemplo completo</strong><span>Primera gestión, entrega y nueva propuesta<ArrowRight size={16}/></span></Link>
    </div>
    <section className={styles.searchBox} aria-label="Buscador de ayuda"><label htmlFor="guide-search"><Search size={18}/>¿Qué necesitás hacer?</label><div><Input id="guide-search" type="search" placeholder="Ej.: no respondió, entregar, borrador…" value={search} onChange={event => setSearch(event.target.value)}/>{search && <Button variant="outline" onClick={() => setSearch('')}>Limpiar búsqueda</Button>}</div></section>
    {term ? <section className={styles.searchResults} aria-label="Resultados de ayuda"><h2>Resultados de ayuda</h2><p role="status">{results.length} {results.length === 1 ? 'explicación encontrada' : 'explicaciones encontradas'} para “{search.trim()}”.</p>{results.length ? <div className={styles.resultGrid}>{results.map(({topic, article}) => <Link key={article.id} to={url(topic.id, article.id)} onClick={() => setSearch('')}><span className={styles.eyebrow}>{topic.title}</span><h3>{article.title}</h3><p>{article.when}</p><span className={styles.read}>Leer los pasos <ArrowRight size={15}/></span></Link>)}</div> : <div className={styles.empty}><p>Probá con otra palabra o volvé a los temas de la guía.</p><Button variant="outline" onClick={() => setSearch('')}>Ver todos los temas</Button></div>}</section> : <div className={styles.workspace}>
      <aside id="guide-topics" className={styles.sidebar}><nav aria-label="Temas de la guía"><h2>Elegí un tema</h2>{topics.map(item => <Link key={item.id} to={url(item.id)} aria-current={topic.id === item.id ? 'page' : undefined}><span>{item.title}</span><span className={styles.count}>{item.articles.length}</span></Link>)}</nav><Link className={styles.problemLink} to={url('problems')}>¿Algo te frena? Revisá las soluciones <ArrowRight size={16}/></Link></aside>
      <div className={styles.reading}>
        <section className={styles.topicIntro}><span className={styles.eyebrow}>TEMA</span><h2>{topic.title}</h2><p>{topic.description}</p><nav aria-label="Explicaciones de este tema">{topic.articles.map((item, i) => <Link key={item.id} to={url(topic.id, item.id)} aria-current={article.id === item.id ? 'page' : undefined}><span>{i+1}</span>{item.title}</Link>)}</nav></section>
        <article className={styles.article} aria-labelledby="guide-article-title">
          <header><a className={styles.backToTopics} href="#guide-topics">Ver los temas de la guía</a><span className={styles.eyebrow}>EXPLICACIÓN {index+1} DE {topic.articles.length}</span><h2 id="guide-article-title" tabIndex={-1} ref={title}>{article.title}</h2><p className={styles.when}><strong>Cuándo usarlo</strong>{article.when}</p></header>
          <section><h3>Cómo hacerlo</h3><ol className={styles.steps}>{article.steps.map((step, i) => <li key={i}><span aria-hidden="true">{i+1}</span><p>{step}</p></li>)}</ol></section>
          <section className={styles.result}><CheckCircle2 size={21}/><div><h3>Qué queda al terminar</h3><p>{article.result}</p></div></section>
          {article.example.length > 0 && <section className={styles.example}><h3><Lightbulb size={20}/>Ejemplo práctico</h3>{article.example.map(line => <p key={line}>{line}</p>)}</section>}
          {article.notes.length > 0 && <section className={styles.notes}><h3>Tené en cuenta</h3><ul>{article.notes.map(note => <li key={note}>{note}</li>)}</ul></section>}
          {article.url && (topic.id !== 'admin' || admin) && <Button asChild><Link to={article.url}>{article.linkLabel}<ArrowRight size={16}/></Link></Button>}
          {topic.id === 'admin' && !admin && <p className={styles.adminNote}>Estas opciones las administra el equipo responsable del CRM. Pedile ayuda al administrador si necesitás un cambio.</p>}
        </article>
        <nav className={styles.pagination} aria-label="Continuar leyendo">{index > 0 ? <Link to={url(topic.id, topic.articles[index-1].id)}><ArrowLeft size={17}/><span><small>Anterior</small>{topic.articles[index-1].title}</span></Link> : <span/>}{index < topic.articles.length-1 ? <Link to={url(topic.id, topic.articles[index+1].id)}><span><small>Siguiente</small>{topic.articles[index+1].title}</span><ArrowRight size={17}/></Link> : <Link to={url('start', 'screens')}><span><small>Seguir consultando</small>Dónde encuentro cada cosa</span><ArrowRight size={17}/></Link>}</nav>
      </div>
    </div>}
  </main></>;
}
