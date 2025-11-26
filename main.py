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

# --- 2. GÜVENLİK VE SESSION AYARLARI (EN ÜSTTE OLMALI) ---
# Bu ayarlar tarayıcının çerezleri "güvensiz" ortamda da tutmasını zorlar.
app.add_middleware(
    SessionMiddleware, 
    secret_key=os.getenv("SECRET_KEY"),
    https_only=False,     # Localhost için zorunlu
    same_site="lax",      # Çerezlerin kaybolmaması için önemli
    max_age=3600          # Oturum süresi (1 saat)
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

# --- GOOGLE AYARLARI ---
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")        
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET") 

# TMDB Bilgileri
API_KEY = os.getenv("TMDB_API_KEY")
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
    ad = Column(String)
    puan = Column(Float)
    poster = Column(String)

Base.metadata.create_all(bind=engine)

# --- MODELLER VE YARDIMCILAR ---
class FilmEkle(BaseModel):
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
    # URL'in sonundaki slash'lere dikkat et
    redirect_uri = "http://127.0.0.1:8000/auth/google/callback"
    return await oauth.google.authorize_redirect(request, redirect_uri)

@app.get("/auth/google/callback")
async def auth_google(request: Request):
    try:
        token = await oauth.google.authorize_access_token(request)
        user = token.get('userinfo')
        if user:
            request.session['user'] = dict(user)
        return RedirectResponse(url="http://127.0.0.1:8000/uygulama/index.html")
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

# --- FİLM İŞLEMLERİ ---

@app.get("/search/{film_adi}")
def search_movie(film_adi: str):
    endpoint = f"{BASE_URL}/search/movie"
    params = {"api_key": API_KEY, "query": film_adi, "language": "tr-TR"}
    try:
        response = requests.get(endpoint, params=params)
        data = response.json()
    except:
        return {"sonuc": []}
    
    if not data.get("results"): return {"sonuc": []}

    filmler = []
    for film in data["results"]:
        filmler.append({
            "tmdb_id": film["id"],
            "ad": film["title"],
            "puan": film["vote_average"],
            "poster": f"https://image.tmdb.org/t/p/w500{film['poster_path']}" if film['poster_path'] else None
        })
    return {"sonuc": filmler}

@app.get("/detay/{tmdb_id}")
def film_detay(tmdb_id: int):
    endpoint = f"{BASE_URL}/movie/{tmdb_id}"
    params = {"api_key": API_KEY, "language": "tr-TR", "append_to_response": "videos"}
    response = requests.get(endpoint, params=params)
    data = response.json()
    
    video_key = None
    if "videos" in data and "results" in data["videos"]:
        for video in data["videos"]["results"]:
            if video["site"] == "YouTube" and video["type"] == "Trailer":
                video_key = video["key"]
                break
    
    return {
        "baslik": data.get("title"),
        "ozet": data.get("overview"),
        "tagline": data.get("tagline"),
        "sure": data.get("runtime"),
        "puan": data.get("vote_average"),
        "poster": f"https://image.tmdb.org/t/p/w500{data['poster_path']}" if data.get('poster_path') else None,
        "backdrop": f"https://image.tmdb.org/t/p/original{data['backdrop_path']}" if data.get('backdrop_path') else None,
        "youtube_video": f"https://www.youtube.com/embed/{video_key}" if video_key else None
    }

@app.post("/ekle")
def filme_ekle(film: FilmEkle, request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request)
    yeni_film = FilmDB(user_email=user['email'], ad=film.ad, puan=film.puan, poster=film.poster)
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