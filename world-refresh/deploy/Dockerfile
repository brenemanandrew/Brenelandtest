# Breneland World Refresh test site: the patched client (made by make_testgame.py) served by testserver.py.
# GET /api/* is read from the live game; anything that writes gets a harmless stub and never reaches the live game.
FROM python:3.12-alpine
WORKDIR /app
COPY www /app/www
COPY testserver.py /app/testserver.py
EXPOSE 8080
CMD ["python3", "/app/testserver.py", "/app/www", "8080"]
