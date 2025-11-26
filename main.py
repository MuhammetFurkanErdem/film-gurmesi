import os
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from starlette.responses import RedirectResponse, JSONResponse
from pydantic import BaseModel
import requests
from sqlalchemy import create_engine, Column, Integer, String, Float
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from authlib.integrations.starlette_client import OAuth
from fastapi.staticfiles import StaticFiles

load_dotenv()

os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'

app = FastAPI()


app.add_middleware(
    SessionMiddleware, 
    secret_key=os.getenv("SECRET_KEY"),
    https_only=False,     
    same_site="lax",      
    max_age=3600          
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 3. KLASÖR BAĞLAMA ---
current_dir = os.path.dirname(os.path.abspath(__file__))
frontend_path = os.path.join(current_dir, "frontend")

if os.path.isdir(frontend_path):
    app.mount("/uygulama", StaticFiles(directory=frontend_path, html=True), name="frontend")

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
TMDB_API_KEY = os.getenv("TMDB_API_KEY") 
BASE_URL = "https://api.themoviedb.org/3"

# --- OAUTH AYARLARI ---
oauth = OAuth()
oauth.register(
    name='google',
    client_id=GOOGLE_CLIENT_ID,
    client_secret=GOOGLE_CLIENT_SECRET,
    server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
    client_kwargs={'scope': 'openid email profile'}
)

# --- VERİTABANI AYARLARI ---
SQLALCHEMY_DATABASE_URL = "sqlite:///./film_arsivi.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class FilmDB(Base):
    __tablename__ = "izlenecekler"
    id = Column(Integer, primary_key=True, index=True)
    user_email = Column(String)
    tmdb_id = Column(Integer)
    tur = Column(String) # <--- YENİ: 'movie' veya 'tv' diye kaydedeceğiz
    ad = Column(String)
    puan = Column(Float)
    poster = Column(String)
    izlendi = Column(String, default="Hayır")
    kisisel_puan = Column(Integer, default=0)
    kisisel_yorum = Column(String, default="")

Base.metadata.create_all(bind=engine)

# --- MODELLER VE YARDIMCILAR ---
class FilmEkle(BaseModel):
    tmdb_id: int
    tur: str
    ad: str
    puan: float
    poster: str = None

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_current_user(request: Request):
    user = request.session.get('user')
    if not user:
        # API isteği ise 401 dön, değilse hata fırlat
        raise HTTPException(status_code=401, detail="Oturum bulunamadı. Lütfen giriş yapın.")
    return user

# --- ENDPOINTLER ---

@app.get("/")
def read_root():
    return RedirectResponse(url="/uygulama/index.html")

@app.get("/auth/login")
async def login(request: Request):
    redirect_uri = str(request.url_for('auth_google'))
    
    if "onrender.com" in redirect_uri:
        redirect_uri = redirect_uri.replace("http://", "https://")
        
    return await oauth.google.authorize_redirect(request, redirect_uri)

@app.get("/auth/google/callback")
async def auth_google(request: Request):
    try:
        token = await oauth.google.authorize_access_token(request)
        user = token.get('userinfo')
        if user:
            request.session['user'] = dict(user)
        # Burayı da dinamik yaptık: Sadece klasör yolunu verdik
        return RedirectResponse(url="/uygulama/index.html")
    except Exception as e:
        return JSONResponse(content={"error": "Giriş Hatası", "detay": str(e)}, status_code=500)

@app.get("/auth/logout")
async def logout(request: Request):
    request.session.clear()
    return {"mesaj": "Çıkış yapıldı"}

@app.get("/user_info")
def user_info(request: Request):
    user = request.session.get('user')
    return user if user else None

# --- FİLM & DİZİ ARAMA (GÜNCELLENDİ) ---
@app.get("/search/{icerik_adi}")
def search_content(icerik_adi: str, tur: str = "movie", sirala: str = "yok"):
    # tur: 'movie' (Film) veya 'tv' (Dizi) olabilir
    
    if not TMDB_API_KEY:
        return {"sonuc": []}

    # Endpoint dinamik oldu: /search/movie veya /search/tv
    endpoint = f"{BASE_URL}/search/{tur}"
    params = {"api_key": TMDB_API_KEY, "query": icerik_adi, "language": "tr-TR"}
    
    try:
        response = requests.get(endpoint, params=params)
        data = response.json()
    except:
        return {"sonuc": []}
    
    if not data.get("results"): return {"sonuc": []}

    icerikler = []
    for item in data["results"]:
        # Filmse 'title', Diziyse 'name' kullanılır. İkisini de kontrol et:
        baslik = item.get("title") or item.get("name")
        
        # Puan bazen boş gelebilir, 0 yapalım
        puan = item.get("vote_average", 0)

        icerikler.append({
            "tmdb_id": item["id"],
            "ad": baslik,
            "puan": puan,
            # Dizi mi Film mi olduğunu da frontend'e söyleyelim
            "tur": "Dizi" if tur == "tv" else "Film",
            "poster": f"https://image.tmdb.org/t/p/w500{item['poster_path']}" if item.get('poster_path') else None
        })

    # Sıralama Mantığı
    if sirala == "puan_azalan":
        icerikler = sorted(icerikler, key=lambda x: x['puan'], reverse=True)
    elif sirala == "puan_artan":
        icerikler = sorted(icerikler, key=lambda x: x['puan'], reverse=False)
    
    return {"sonuc": icerikler}

@app.get("/detay/{tmdb_id}")
def film_detay(tmdb_id: int, tur: str = "movie"): # <--- 'tur' parametresi eklendi
    
    # Endpoint dinamik oldu: /movie/123 veya /tv/123
    endpoint = f"{BASE_URL}/{tur}/{tmdb_id}"
    params = {
        "api_key": TMDB_API_KEY, 
        "language": "tr-TR", 
        "append_to_response": "videos,watch/providers,credits,external_ids" 
    }
    
    response = requests.get(endpoint, params=params)
    data = response.json()
    
    baslik = data.get("title") or data.get("name") 
    
    sure = data.get("runtime") 
    if not sure and data.get("episode_run_time"): 
        sure = data["episode_run_time"][0]
    
    yonetmen = "Bilinmiyor"
    if "credits" in data:
        for kisi in data["credits"].get("crew", []):
            if kisi["job"] == "Director":
                yonetmen = kisi["name"]
                break
        if tur == "tv" and data.get("created_by"):
            yonetmen = data["created_by"][0]["name"]

    oyuncular = []
    for oyuncu in data["credits"].get("cast", [])[:5]:
        oyuncular.append(oyuncu["name"])

    turler = [tur_obj["name"] for tur_obj in data.get("genres", [])]

    video_key = None
    if "videos" in data and "results" in data["videos"]:
        for video in data["videos"]["results"]:
            if video["site"] == "YouTube" and video["type"] == "Trailer":
                video_key = video["key"]
                break
    
    platformlar = []
    if "watch/providers" in data and "results" in data["watch/providers"]:
        tr_data = data["watch/providers"]["results"].get("TR")
        if tr_data and "flatrate" in tr_data:
            for platform in tr_data["flatrate"]:
                platformlar.append({
                    "ad": platform["provider_name"],
                    "logo": f"https://image.tmdb.org/t/p/original{platform['logo_path']}"
                })

    return {
        "baslik": baslik,
        "ozet": data.get("overview"),
        "tagline": data.get("tagline"),
        "sure": sure,
        "puan": data.get("vote_average"),
        "poster": f"https://image.tmdb.org/t/p/w500{data['poster_path']}" if data.get('poster_path') else None,
        "backdrop": f"https://image.tmdb.org/t/p/original{data['backdrop_path']}" if data.get('backdrop_path') else None,
        "youtube_video": f"https://www.youtube.com/embed/{video_key}" if video_key else None,
        "platformlar": platformlar,
        "yonetmen": yonetmen,
        "oyuncular": oyuncular,
        "turler": turler,
        "imdb_id": data.get("external_ids", {}).get("imdb_id")
    }

@app.post("/ekle")
def filme_ekle(film: FilmEkle, request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request)
    yeni_film = FilmDB(
        user_email=user['email'],
        tmdb_id=film.tmdb_id,
        tur=film.tur,
        ad=film.ad, 
        puan=film.puan, 
        poster=film.poster,
        izlendi="Hayır",
        kisisel_puan=0,  # Varsayılan
        kisisel_yorum="" # Varsayılan
    )
    db.add(yeni_film)
    db.commit()
    return {"mesaj": "Eklendi"}

@app.get("/listem")
def listemi_getir(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request)
    filmler = db.query(FilmDB).filter(FilmDB.user_email == user['email']).all()
    return {"listem": filmler}

@app.delete("/sil/{film_id}")
def film_sil(film_id: int, request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request)
    film = db.query(FilmDB).filter(FilmDB.id == film_id, FilmDB.user_email == user['email']).first()
    if not film: raise HTTPException(status_code=404, detail="Silinemedi")
    db.delete(film)
    db.commit()
    return {"mesaj": "Silindi"}

class DurumGuncelle(BaseModel):
    izlendi: str = None
    kisisel_puan: int = None
    kisisel_yorum: str = None

@app.put("/guncelle/{film_id}")
def durum_guncelle(film_id: int, veri: DurumGuncelle, request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request)
    film = db.query(FilmDB).filter(FilmDB.id == film_id, FilmDB.user_email == user['email']).first()
    
    if not film:
        raise HTTPException(status_code=404, detail="Film bulunamadı")
    
    if veri.izlendi is not None:
        film.izlendi = veri.izlendi
    if veri.kisisel_puan is not None:
        film.kisisel_puan = veri.kisisel_puan
    if veri.kisisel_yorum is not None:
        film.kisisel_yorum = veri.kisisel_yorum
        
    db.commit()
    return {"mesaj": "Güncellendi"}
 