FROM gitpod/workspace-mongodb

COPY .gitpod/load.nginx.conf /etc/nginx/nginx.conf

RUN sudo apt-get update && sudo apt-get install redis-server -y

RUN wget https://downloads.apache.org/kafka/3.1.0/kafka_2.13-3.1.0.tgz  && \
    tar xzf kafka_2.13-3.1.0.tgz && \
    sudo mv kafka_2.13-3.1.0 /kafka && \
    rm kafka_2.13-3.1.0.tgz

RUN wget https://dl.min.io/server/minio/release/linux-amd64/minio && \
    sudo mkdir -p /minio && \
    sudo mv minio /minio/minio && \
    chmod +x /minio/minio
