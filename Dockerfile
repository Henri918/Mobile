FROM python:3.12-slim

WORKDIR /app

RUN pip install --no-cache-dir Flask flask-cors mysql-connector-python bcrypt

COPY app.py .

EXPOSE 5000

CMD ["python", "app.py"]